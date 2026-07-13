"use strict";

const downloadPackageButton = document.getElementById("downloadPackageButton");
const packageSummary = document.getElementById("packageSummary");
const packageStatus = document.getElementById("packageStatus");
const refreshDataButton = document.getElementById("refreshDataButton");

let recipes = [];
let ingredients = [];

const RECIPES_DRAFT_KEY = "willsgrill-recipes-draft";
const INGREDIENTS_DRAFT_KEY = "willsgrill-ingredients-draft";
const METHOD_STEP_COUNT = 8;
const RECIPE_CATEGORIES = ["BBQ", "Chicken", "Fish", "Turkey", "Vegetarian"];
const RECIPE_DIFFICULTIES = ["Easy", "Medium", "Hard"];

downloadPackageButton.addEventListener("click", downloadExportZip);
refreshDataButton.addEventListener("click", discardLocalChanges);
initialiseExportPage();

async function initialiseExportPage() {
    try {
        const [recipeData, ingredientData] = await Promise.all([
            loadJSON(CONFIG.recipesFile),
            loadJSON(CONFIG.ingredientsFile)
        ]);

        recipes = readDraft(RECIPES_DRAFT_KEY, recipeData);
        ingredients = readDraft(INGREDIENTS_DRAFT_KEY, ingredientData);

        if (!Array.isArray(recipes) || !Array.isArray(ingredients)) {
            throw new Error("Website data must contain JSON arrays.");
        }

        const changedImages = await getChangedRecipeImages(recipes);
        packageSummary.textContent = `${recipes.length} recipes, ${ingredients.length} ingredients, and ${changedImages.length} changed image${changedImages.length === 1 ? "" : "s"}.`;
        downloadPackageButton.disabled = false;
    }
    catch (error) {
        console.error(error);
        packageSummary.textContent = "The current website data could not be loaded.";
        setStatus("Unable to prepare the export. Check the configured data source.", true);
    }
}

async function downloadExportZip() {
    if (typeof JSZip === "undefined") {
        setStatus("The ZIP library could not be loaded. Check your internet connection and try again.", true);
        return;
    }

    downloadPackageButton.disabled = true;
    setStatus("Preparing ZIP...");

    try {
        const validationError = validateExportData();
        if (validationError) throw new Error(validationError);

        const zip = new JSZip();
        zip.file("data/ingredients/ingredients.json", JSON.stringify(ingredients, null, 2));
        zip.file("data/recipes/recipes.json", JSON.stringify(recipes, null, 2));

        const changedImages = await getChangedRecipeImages(recipes);

        for (const changedImage of changedImages) {
            zip.file(`assets/images/recipes/${changedImage.filename}`, changedImage.blob);
        }

        const blob = await zip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
            compressionOptions: { level: 6 }
        });

        downloadBlob(blob, `willsgrill-export-${getDateStamp()}.zip`);
        const imageMessage = changedImages.length
            ? ` Included ${changedImages.length} changed image${changedImages.length === 1 ? "" : "s"}.`
            : " No changed images were included.";
        setStatus(`ZIP downloaded.${imageMessage}`);
    }
    catch (error) {
        console.error(error);
        setStatus("Unable to create the export ZIP.", true);
    }
    finally {
        downloadPackageButton.disabled = false;
    }
}

function validateExportData() {
    const recipeIds = new Set();
    const ingredientIds = new Set();

    for (const ingredient of ingredients) {
        if (!ingredient.id || !/^ING-[A-Z]-\d{3}$/.test(ingredient.id)) return "An ingredient has an invalid ID.";
        if (!ingredient.name || !ingredient.category) return `Ingredient ${ingredient.id} is missing a name or category.`;
        if (ingredientIds.has(ingredient.id)) return `Duplicate ingredient ID: ${ingredient.id}.`;
        ingredientIds.add(ingredient.id);
    }

    for (const recipe of recipes) {
        if (!recipe.id || recipeIds.has(recipe.id)) return `Recipe IDs must be present and unique: ${recipe.id || "missing ID"}.`;
        if (!recipe.name || !recipe.category || !recipe.description || !recipe.difficulty || !recipe.tip) {
            return `Recipe ${recipe.id} is missing required information.`;
        }
        if (!RECIPE_CATEGORIES.includes(recipe.category)) return `Recipe ${recipe.id} has an invalid category.`;
        if (!RECIPE_DIFFICULTIES.includes(recipe.difficulty)) return `Recipe ${recipe.id} has an invalid difficulty.`;
        if (!/^rec\d{3}\.jpg$/i.test(recipe.image || "")) return `Recipe ${recipe.id} needs a rec###.jpg image.`;
        if (!Array.isArray(recipe.steps) || recipe.steps.length !== METHOD_STEP_COUNT || recipe.steps.some((step) => !String(step).trim())) {
            return `Recipe ${recipe.id} needs exactly ${METHOD_STEP_COUNT} completed method steps.`;
        }
        if (!Array.isArray(recipe.ingredients) || !recipe.ingredients.length) return `Recipe ${recipe.id} needs at least one ingredient.`;
        if (recipe.ingredients.some((row) => !ingredientIds.has(row.ingredient) || !Number.isFinite(Number(row.quantity)) || Number(row.quantity) <= 0)) {
            return `Recipe ${recipe.id} has an invalid ingredient reference or quantity.`;
        }
        recipeIds.add(recipe.id);
    }

    return "";
}

function discardLocalChanges() {
    if (!confirm("Discard local recipe and ingredient changes and reload website data?")) return;
    localStorage.removeItem(RECIPES_DRAFT_KEY);
    localStorage.removeItem(INGREDIENTS_DRAFT_KEY);
    clearChangedRecipeImages().then(() => window.location.reload());
}

function clearChangedRecipeImages() {
    return new Promise((resolve) => {
        if (!window.indexedDB) {
            resolve();
            return;
        }

        const request = indexedDB.open("willsgrill-editor", 1);
        request.onsuccess = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains("changed-images")) {
                database.close();
                resolve();
                return;
            }

            const transaction = database.transaction("changed-images", "readwrite");
            transaction.objectStore("changed-images").clear();
            transaction.oncomplete = () => {
                database.close();
                resolve();
            };
            transaction.onerror = () => {
                database.close();
                resolve();
            };
        };
        request.onerror = () => resolve();
    });
}

async function loadJSON(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Unable to load ${path}`);
    return response.json();
}

function getChangedRecipeImages(recipeList) {
    return new Promise((resolve) => {
        if (!window.indexedDB) {
            resolve([]);
            return;
        }

        const request = indexedDB.open("willsgrill-editor", 1);

        request.onupgradeneeded = () => {
            request.result.createObjectStore("changed-images", { keyPath: "filename" });
        };

        request.onsuccess = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains("changed-images")) {
                database.close();
                resolve([]);
                return;
            }
            const transaction = database.transaction("changed-images", "readonly");
            const getAllRequest = transaction.objectStore("changed-images").getAll();
            getAllRequest.onsuccess = () => {
                database.close();
                const referencedImages = new Set(recipeList.map((recipe) => recipe.image).filter(Boolean));
                resolve((getAllRequest.result || []).filter((image) => referencedImages.has(image.filename)));
            };
            getAllRequest.onerror = () => {
                database.close();
                resolve([]);
            };
        };

        request.onerror = () => resolve([]);
    });
}

function readDraft(key, fallback) {
    try {
        const draft = JSON.parse(localStorage.getItem(key));
        return Array.isArray(draft) ? draft : (Array.isArray(fallback) ? fallback : []);
    }
    catch (error) {
        return Array.isArray(fallback) ? fallback : [];
    }
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}

function getDateStamp() {
    return new Date().toISOString().slice(0, 10);
}

function setStatus(message, isError = false) {
    packageStatus.textContent = message;
    packageStatus.classList.toggle("error", isError);
}
