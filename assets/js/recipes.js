"use strict";

let recipes = [];
let ingredients = [];
let currentRecipe = null;
let editingRecipeId = null;
let activeEditorTab = "general";
let recipeSearchText = "";
let recipeCategoryFilter = "";
let recipeSortKey = "name-asc";
let pendingRecipeImage = null;

const RECIPES_DRAFT_KEY = "willsgrill-recipes-draft";
const INGREDIENTS_DRAFT_KEY = "willsgrill-ingredients-draft";
const METHOD_STEP_COUNT = 8;
const RECIPE_CATEGORIES = ["BBQ", "Chicken", "Fish", "Turkey", "Vegetarian"];
const RECIPE_DIFFICULTIES = ["Easy", "Medium", "Hard"];

document.addEventListener("DOMContentLoaded", initialiseRecipesPage);

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.getElementById("editorPanel")?.classList.contains("open")) {
        closeEditor();
    }
});

function initialiseRecipesPage() {

    const searchInput = document.getElementById("recipeSearch");
    const newRecipeButton = document.getElementById("newRecipeButton");
    const closeEditorButton = document.getElementById("closeEditor");
    const exportRecipesButton = document.getElementById("exportRecipesButton");
    const categoryFilter = document.getElementById("recipeCategoryFilter");
    const sortSelect = document.getElementById("recipeSort");

    if (searchInput) {
        searchInput.addEventListener("input", () => {
            recipeSearchText = searchInput.value;
            renderRecipeTable();
        });
    }

    if (categoryFilter) {
        categoryFilter.addEventListener("change", () => {
            recipeCategoryFilter = categoryFilter.value;
            renderRecipeTable();
        });
    }

    if (sortSelect) {
        sortSelect.addEventListener("change", () => {
            recipeSortKey = sortSelect.value;
            renderRecipeTable();
        });
    }

    if (newRecipeButton) {
        newRecipeButton.addEventListener("click", () => openEditor(createBlankRecipe()));
    }

    if (closeEditorButton) {
        closeEditorButton.addEventListener("click", closeEditor);
    }

    if (exportRecipesButton) {
        exportRecipesButton.addEventListener("click", exportCurrentRecipes);
    }

    document.querySelectorAll(".tab").forEach((tab) => {
        tab.addEventListener("click", () => {
            activeEditorTab = tab.getAttribute("data-tab") || "general";
            updateActiveTab();
        });
    });

    loadRecipeData();
}

async function loadRecipeData() {

    try {

        const [recipeData, ingredientData] = await Promise.all([
            loadJSON(CONFIG.recipesFile),
            loadJSON(CONFIG.ingredientsFile)
        ]);

        if (!Array.isArray(recipeData) || !Array.isArray(ingredientData)) {
            throw new Error("Website data must contain recipe and ingredient arrays.");
        }

        recipes = readDraft(RECIPES_DRAFT_KEY, recipeData).map(normalizeRecipeSteps);
        ingredients = readDraft(INGREDIENTS_DRAFT_KEY, ingredientData);
        saveDraft(RECIPES_DRAFT_KEY, recipes);

        populateRecipeCategoryFilter();
        renderRecipeTable();

    }
    catch (error) {

        console.error(error);

        const table = document.getElementById("recipeTable");

        if (table) {
            table.innerHTML = '<tr><td colspan="9" class="empty-state">Unable to load recipes.</td></tr>';
        }

    }

}

async function loadJSON(path) {

    const response = await fetch(path);

    if (!response.ok) {
        throw new Error(`Unable to load ${path}`);
    }

    return response.json();

}

function exportCurrentRecipes() {
    const validationError = validateRecipeCollection(recipes);

    if (validationError) {
        alert(`Recipes cannot be exported: ${validationError}`);
        return;
    }

    downloadRecipeFile(recipes);
}

function validateRecipeCollection(recipeList) {
    const recipeIds = new Set();

    for (const recipe of recipeList) {
        if (!recipe.id) return "A recipe is missing an ID.";
        if (recipeIds.has(recipe.id)) return `Duplicate recipe ID: ${recipe.id}.`;
        recipeIds.add(recipe.id);

        if (recipe.image && !/^rec\d{3}\.jpg$/i.test(recipe.image)) {
            return `Invalid image filename on ${recipe.id}: ${recipe.image}.`;
        }

        if (!Array.isArray(recipe.steps) || recipe.steps.length !== METHOD_STEP_COUNT || recipe.steps.some((step) => !String(step).trim())) {
            return `${recipe.id} needs exactly ${METHOD_STEP_COUNT} completed method steps.`;
        }

        for (const row of recipe.ingredients || []) {
            if (!ingredients.some((ingredient) => ingredient.id === row.ingredient)) {
                return `${recipe.id} references missing ingredient ${row.ingredient}.`;
            }
        }
    }

    return "";
}

function renderRecipeTable() {

    const tableBody = document.getElementById("recipeTable");

    if (!tableBody) return;

    const query = recipeSearchText.trim().toLowerCase();
    const visibleRecipes = recipes.filter((recipe) => {

        if (recipeCategoryFilter && recipe.category !== recipeCategoryFilter) {
            return false;
        }

        if (!query) return true;

        const recipeMatches = [recipe.id, recipe.name, recipe.category, recipe.description]
            .filter(Boolean)
            .some((value) => value.toString().toLowerCase().includes(query));

        if (recipeMatches) {
            return true;
        }

        return recipeIngredientsMatch(recipe, query);

    });

    visibleRecipes.sort(compareRecipes);

    if (!visibleRecipes.length) {
        tableBody.innerHTML = '<tr><td colspan="9" class="empty-state">No recipes found.</td></tr>';
        return;
    }

    tableBody.innerHTML = visibleRecipes.map((recipe) => `
        <tr>
            <td>${escapeHtml(recipe.id || "")}</td>
            <td>${escapeHtml(recipe.name || "")}</td>
            <td>${escapeHtml(recipe.category || "")}</td>
            <td>${escapeHtml(recipe.prepTime || "")}</td>
            <td>${escapeHtml(recipe.cookTime || "")}</td>
            <td>${escapeHtml(recipe.serves || "")}</td>
            <td>${escapeHtml(recipe.image || "")}</td>
            <td class="edit-action">
                <div class="table-actions">
                    <button type="button" class="secondary-button table-action-button" data-action="edit-recipe" data-recipe-id="${escapeHtml(recipe.id || "")}">Edit</button>
                    <button type="button" class="danger-button table-action-button" data-action="delete-recipe" data-recipe-id="${escapeHtml(recipe.id || "")}">Delete</button>
                </div>
            </td>
        </tr>
    `).join("");

    tableBody.querySelectorAll("[data-action='edit-recipe']").forEach((button) => {
        button.addEventListener("click", () => openEditor(findRecipeById(button.getAttribute("data-recipe-id"))));
    });

    tableBody.querySelectorAll("[data-action='delete-recipe']").forEach((button) => {
        button.addEventListener("click", () => deleteRecipe(button.getAttribute("data-recipe-id")));
    });

}

function populateRecipeCategoryFilter() {
    const categoryFilter = document.getElementById("recipeCategoryFilter");
    if (!categoryFilter) return;

    const categories = [...new Set(recipes.map((recipe) => recipe.category).filter(Boolean))]
        .sort((first, second) => first.localeCompare(second));

    categoryFilter.innerHTML = '<option value="">All categories</option>' + categories
        .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
        .join("");
    categoryFilter.value = recipeCategoryFilter;
}

function compareRecipes(firstRecipe, secondRecipe) {
    const [field, direction] = recipeSortKey.split("-");
    const firstValue = String(firstRecipe[field] || "").toLowerCase();
    const secondValue = String(secondRecipe[field] || "").toLowerCase();
    const result = firstValue.localeCompare(secondValue, undefined, { numeric: true });
    return direction === "desc" ? -result : result;
}

function recipeIngredientsMatch(recipe, query) {
    const ingredientReferences = (recipe.ingredients || [])
        .map((item) => (item.ingredient || "").toString().toLowerCase())
        .filter(Boolean);

    if (ingredientReferences.some((ingredientText) => ingredientText.includes(query))) {
        return true;
    }

    const matchingIngredientIds = new Set(
        ingredients
            .filter((ingredient) => {
                return [ingredient.id, ingredient.name, ingredient.category, ingredient.unit]
                    .filter(Boolean)
                    .some((value) => value.toString().toLowerCase().includes(query));
            })
            .map((ingredient) => (ingredient.id || "").toString().toLowerCase())
    );

    return ingredientReferences.some((reference) => matchingIngredientIds.has(reference));
}

function createBlankRecipe() {

    return {
        id: generateRecipeId(),
        version: 1,
        name: "",
        description: "",
        image: "",
        category: "",
        prepTime: "",
        cookTime: "",
        serves: "",
        difficulty: "",
        ingredients: [{ ingredient: "", quantity: "" }],
        steps: Array(METHOD_STEP_COUNT).fill(""),
        nutrition: {
            calories: "",
            protein: "",
            carbs: "",
            fat: ""
        },
        tip: ""
    };

}

function generateRecipeId() {
    const usedNumbers = new Set(
        recipes
            .map((recipe) => (recipe.id || "").match(/^REC(\d+)$/i))
            .filter(Boolean)
            .map((match) => Number(match[1]))
    );

    let number = 1;
    while (usedNumbers.has(number)) number += 1;
    return `REC${String(number).padStart(3, "0")}`;
}

function deleteRecipe(recipeId) {
    const recipe = findRecipeById(recipeId);
    if (!recipe || !recipe.id) return;

    if (!confirm(`Delete ${recipe.name || recipe.id}? This change will be included in the next export.`)) return;

    recipes = recipes.filter((item) => item.id !== recipe.id);
    saveDraft(RECIPES_DRAFT_KEY, recipes);
    if (!recipes.some((item) => item.image === recipe.image)) {
        removeChangedRecipeImage(recipe.image);
    }
    renderRecipeTable();
}

function openEditor(recipe) {

    if (!recipe) return;

    currentRecipe = normalizeRecipeSteps(cloneRecipe(recipe));
    editingRecipeId = recipe.id || null;
    activeEditorTab = "general";
    pendingRecipeImage = null;
    renderEditor();

    const editorPanel = document.getElementById("editorPanel");

    if (editorPanel) {
        editorPanel.classList.add("open");
    }

    updateActiveTab();
}

function closeEditor() {

    const editorPanel = document.getElementById("editorPanel");

    if (editorPanel) {
        editorPanel.classList.remove("open");
    }

    currentRecipe = null;
    editingRecipeId = null;
    activeEditorTab = "general";
    pendingRecipeImage = null;

}

function duplicateCurrentRecipe() {
    const recipe = collectRecipeFromForm();
    if (!recipe) return;

    const duplicate = cloneRecipe(recipe);
    duplicate.id = generateRecipeId();
    duplicate.name = `${recipe.name || "Recipe"} Copy`;
    duplicate.image = "";
    editingRecipeId = null;
    currentRecipe = duplicate;
    activeEditorTab = "general";
    renderEditor();
    updateActiveTab();
    showEditorFeedback("Recipe duplicated. Add a new image, then save it as a new recipe.", false);
}

function renderEditor() {

    const editorContent = document.getElementById("editorContent");

    if (!editorContent || !currentRecipe) return;

    editorContent.innerHTML = `
        <form id="recipeEditorForm" class="editor-form">
            <div class="editor-section ${activeEditorTab === "general" ? "visible" : "hidden"}" data-tab="general">
                <h3>General</h3>
                <div class="field-grid">
                    <label>
                        Recipe ID
                        <input id="recipeId" value="${escapeHtml(currentRecipe.id || "")}" readonly required>
                    </label>
                    <label>
                        Name
                        <input id="recipeName" value="${escapeHtml(currentRecipe.name || "")}" required>
                    </label>
                    <label class="full-width">
                        Description
                        <textarea id="recipeDescription" rows="3">${escapeHtml(currentRecipe.description || "")}</textarea>
                    </label>
                    <label>
                        Category
                        <select id="recipeCategory" required>
                            ${renderRecipeChoiceOptions(RECIPE_CATEGORIES, currentRecipe.category)}
                        </select>
                    </label>
                    <label>
                        Prep Time
                        <input id="recipePrepTime" type="number" min="0" value="${renderNumericValue(currentRecipe.prepTime)}" required>
                    </label>
                    <label>
                        Cook Time
                        <input id="recipeCookTime" type="number" min="0" value="${renderNumericValue(currentRecipe.cookTime)}" required>
                    </label>
                    <label>
                        Serves
                        <input id="recipeServes" type="number" min="1" value="${renderNumericValue(currentRecipe.serves)}" required>
                    </label>
                    <label>
                        Difficulty
                        <select id="recipeDifficulty" required>
                            ${renderRecipeChoiceOptions(RECIPE_DIFFICULTIES, currentRecipe.difficulty)}
                        </select>
                    </label>
                    <label class="full-width">
                        Chef's Tip
                        <textarea id="recipeTip" rows="3">${escapeHtml(currentRecipe.tip || "")}</textarea>
                    </label>
                </div>
            </div>

            <div class="editor-section ${activeEditorTab === "ingredients" ? "visible" : "hidden"}" data-tab="ingredients">
                <div class="section-header">
                    <h3>Ingredients</h3>
                    <button type="button" class="secondary-button" data-action="add-ingredient">+ Add Ingredient</button>
                </div>
                <table class="editor-table">
                    <thead>
                        <tr>
                            <th>Ingredient</th>
                            <th>Quantity</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody id="ingredientRows">
                        ${renderIngredientRows(currentRecipe.ingredients || [])}
                    </tbody>
                </table>
            </div>

            <div class="editor-section ${activeEditorTab === "method" ? "visible" : "hidden"}" data-tab="method">
                <div class="section-header">
                    <h3>Method</h3>
                    <span class="field-help">8 steps required</span>
                </div>
                <div id="methodRows">
                    ${renderMethodRows(currentRecipe.steps || [])}
                </div>
            </div>

            <div class="editor-section ${activeEditorTab === "nutrition" ? "visible" : "hidden"}" data-tab="nutrition">
                <h3>Nutrition</h3>
                <div class="field-grid">
                    <label>
                        Calories
                        <input id="nutritionCalories" type="number" min="0" value="${renderNumericValue(currentRecipe.nutrition?.calories)}">
                    </label>
                    <label>
                        Protein
                        <input id="nutritionProtein" type="number" min="0" value="${renderNumericValue(currentRecipe.nutrition?.protein)}">
                    </label>
                    <label>
                        Carbohydrates
                        <input id="nutritionCarbs" type="number" min="0" value="${renderNumericValue(currentRecipe.nutrition?.carbs)}">
                    </label>
                    <label>
                        Fat
                        <input id="nutritionFat" type="number" min="0" value="${renderNumericValue(currentRecipe.nutrition?.fat)}">
                    </label>
                </div>
            </div>

            <div class="editor-section ${activeEditorTab === "image" ? "visible" : "hidden"}" data-tab="image">
                <h3>Image</h3>
                <div class="field-grid">
                    <label class="full-width">
                        Image Filename
                        <input id="recipeImage" value="${escapeHtml(currentRecipe.image || "")}" readonly>
                    </label>
                    <label class="full-width">
                        Upload Image
                        <input id="recipeImageFile" type="file" accept="image/*">
                        <span class="field-help">The image will be converted to a web-friendly JPEG and named automatically, for example rec001.jpg.</span>
                    </label>
                    <div id="recipeImagePreview" class="recipe-image-upload-preview ${currentRecipe.image ? "has-image" : ""}">
                        ${currentRecipe.image ? `<span>Current image: ${escapeHtml(currentRecipe.image)}</span>` : "Select an image to convert it."}
                    </div>
                </div>
            </div>

            <div class="editor-actions">
                <button type="submit" class="primary-button">Save</button>
                <button type="button" class="secondary-button" id="duplicateRecipeButton">Duplicate</button>
                <button type="button" class="secondary-button" id="downloadRecipeJson">Download JSON</button>
            </div>

            <p id="editorFeedback" class="editor-feedback"></p>
        </form>
    `;

    const form = document.getElementById("recipeEditorForm");

    if (form) {
        form.addEventListener("submit", handleRecipeSave);
    }

    const downloadButton = document.getElementById("downloadRecipeJson");
    const duplicateButton = document.getElementById("duplicateRecipeButton");

    if (downloadButton) {
        downloadButton.addEventListener("click", () => {
            const recipeToDownload = collectRecipeFromForm();
            if (!recipeToDownload) return;

            const validationError = validateRecipe(recipeToDownload);
            if (validationError) {
                showEditorFeedback(validationError, true);
                return;
            }

            downloadRecipeFile(recipeToDownload);
        });
    }

    if (duplicateButton) {
        duplicateButton.addEventListener("click", duplicateCurrentRecipe);
    }

    const imageFileInput = document.getElementById("recipeImageFile");

    if (imageFileInput) {
        imageFileInput.addEventListener("change", handleRecipeImageSelection);
    }

    attachEditorListHandlers();
    updateActiveTab();
}

function renderIngredientRows(ingredientRows) {

    if (!ingredientRows.length) {
        ingredientRows = [{ ingredient: "", quantity: "" }];
    }

    return ingredientRows.map((row, index) => `
        <tr>
            <td>
                <div class="ingredient-picker">
                    <input type="search"
                           class="ingredient-search-input"
                           data-field="ingredient"
                           data-index="${index}"
                           data-ingredient-id="${escapeHtml(row.ingredient || "")}"
                           value="${escapeHtml(getIngredientDisplayValue(row.ingredient))}"
                           placeholder="Search ingredients..."
                           autocomplete="off"
                           aria-label="Ingredient ${index + 1}"
                           aria-expanded="false">
                    <div class="ingredient-options" hidden>
                        ${ingredients.map((ingredient) => `
                            <button type="button" data-ingredient-id="${escapeHtml(ingredient.id || "")}">
                                <strong>${escapeHtml(ingredient.name || ingredient.id || "")}</strong>
                                <span>${escapeHtml(ingredient.id || "")}</span>
                            </button>
                        `).join("")}
                    </div>
                </div>
            </td>
            <td>
                <input type="text" inputmode="decimal" data-field="quantity" data-index="${index}" value="${escapeHtml(row.quantity || "")}">
            </td>
            <td>
                <button type="button" class="secondary-button" data-action="remove-ingredient" data-index="${index}">Remove</button>
            </td>
        </tr>
    `).join("");

}

function getIngredientDisplayValue(ingredientId) {
    const ingredient = ingredients.find((item) => item.id === ingredientId);
    if (!ingredient) return ingredientId || "";
    return ingredient.name || ingredient.id || "";
}

async function handleRecipeImageSelection(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const preview = document.getElementById("recipeImagePreview");
    const imageField = document.getElementById("recipeImage");
    const filename = getNextRecipeImageFilename();

    try {
        if (preview) preview.textContent = "Converting image...";

        const image = await loadRecipeImage(file);
        const jpegBlob = await convertRecipeImageToJpeg(image);

        if (imageField) imageField.value = filename;
        if (currentRecipe) currentRecipe.image = filename;

        pendingRecipeImage = { filename, blob: jpegBlob };
        downloadRecipeImage(jpegBlob, filename);

        if (preview) {
            preview.innerHTML = `<strong>${escapeHtml(filename)}</strong><span>Converted JPEG downloaded.</span>`;
            preview.classList.add("has-image");
        }
    }
    catch (error) {
        console.error(error);
        if (preview) preview.textContent = "Unable to convert this image.";
    }
}

function getNextRecipeImageFilename() {
    if (currentRecipe?.image) {
        return currentRecipe.image;
    }

    const highestNumber = recipes.reduce((highest, recipe) => {
        const match = (recipe.image || "").match(/^rec(\d+)\.jpg$/i);
        return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0);

    return `rec${String(highestNumber + 1).padStart(3, "0")}.jpg`;
}

function loadRecipeImage(file) {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();

        image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error(`Unable to read ${file.name}`));
        };
        image.src = objectUrl;
    });
}

function convertRecipeImageToJpeg(image) {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;

        const context = canvas.getContext("2d");
        if (!context) {
            reject(new Error("Canvas is not supported by this browser."));
            return;
        }

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0);
        canvas.toBlob((blob) => {
            blob ? resolve(blob) : reject(new Error("Unable to create JPEG."));
        }, "image/jpeg", .88);
    });
}

function downloadRecipeImage(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function saveChangedRecipeImage(filename, blob) {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            resolve();
            return;
        }

        const request = indexedDB.open("willsgrill-editor", 1);

        request.onupgradeneeded = () => {
            request.result.createObjectStore("changed-images", { keyPath: "filename" });
        };

        request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction("changed-images", "readwrite");
            transaction.objectStore("changed-images").put({ filename, blob });
            transaction.oncomplete = () => {
                database.close();
                resolve();
            };
            transaction.onerror = () => {
                database.close();
                reject(transaction.error);
            };
        };

        request.onerror = () => reject(request.error);
    });
}

function removeChangedRecipeImage(filename) {
    if (!filename || !window.indexedDB) return;

    const request = indexedDB.open("willsgrill-editor", 1);
    request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("changed-images", "readwrite");
        transaction.objectStore("changed-images").delete(filename);
        transaction.oncomplete = () => database.close();
    };
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

function saveDraft(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

function normalizeRecipeSteps(recipe) {
    const steps = Array.isArray(recipe.steps) ? recipe.steps : [];

    return {
        ...recipe,
        steps: Array.from({ length: METHOD_STEP_COUNT }, (_, index) => String(steps[index] || ""))
    };
}

function renderRecipeChoiceOptions(options, selectedValue) {
    return `<option value="">Select an option</option>${options.map((option) => `
        <option value="${escapeHtml(option)}" ${option === selectedValue ? "selected" : ""}>${escapeHtml(option)}</option>
    `).join("")}`;
}

function renderMethodRows(steps) {

    steps = normalizeRecipeSteps({ steps }).steps;

    return steps.map((step, index) => `
        <div class="method-row">
            <div class="method-label">Step ${index + 1}</div>
            <textarea data-field="step" data-index="${index}" rows="3">${escapeHtml(step)}</textarea>
        </div>
    `).join("");

}

function attachEditorListHandlers() {

    const editorContent = document.getElementById("editorContent");

    if (!editorContent) return;

    editorContent.querySelectorAll("[data-action]").forEach((button) => {
        button.addEventListener("click", handleEditorAction);
    });

    editorContent.querySelectorAll(".ingredient-picker").forEach(attachIngredientPicker);

}

function attachIngredientPicker(picker) {

    const input = picker.querySelector(".ingredient-search-input");
    const options = picker.querySelector(".ingredient-options");
    if (!input || !options) return;

    const optionButtons = Array.from(options.querySelectorAll("button"));

    const showOptions = () => {
        options.hidden = false;
        input.setAttribute("aria-expanded", "true");
        filterIngredientOptions(input, optionButtons);
    };

    input.addEventListener("focus", showOptions);
    input.addEventListener("input", () => {
        input.dataset.ingredientId = "";
        showOptions();
    });

    optionButtons.forEach((button) => {
        button.addEventListener("mousedown", (event) => event.preventDefault());
        button.addEventListener("click", () => {
            input.value = button.querySelector("strong")?.textContent || "";
            input.dataset.ingredientId = button.dataset.ingredientId || "";
            options.hidden = true;
            input.setAttribute("aria-expanded", "false");
        });
    });

    input.addEventListener("blur", () => {
        window.setTimeout(() => {
            options.hidden = true;
            input.setAttribute("aria-expanded", "false");
        }, 120);
    });

}

function filterIngredientOptions(input, optionButtons) {

    const query = input.value.trim().toLowerCase();

    optionButtons.forEach((button) => {
        const text = button.textContent.toLowerCase();
        button.hidden = query && !text.includes(query);
    });

}

function updateActiveTab() {

    document.querySelectorAll(".tab").forEach((tab) => {
        const isActive = tab.getAttribute("data-tab") === activeEditorTab;
        tab.classList.toggle("active", isActive);
    });

    document.querySelectorAll(".editor-section").forEach((section) => {
        const sectionTab = section.getAttribute("data-tab");
        section.classList.toggle("visible", sectionTab === activeEditorTab);
        section.classList.toggle("hidden", sectionTab !== activeEditorTab);
    });

}

function handleEditorAction(event) {

    const button = event.currentTarget;
    const action = button.getAttribute("data-action");

    if (action === "add-ingredient") {
        addIngredientRow();
        return;
    }

    if (action === "remove-ingredient") {
        removeIngredientRow(Number(button.getAttribute("data-index")));
        return;
    }

}

function addIngredientRow() {

    if (!currentRecipe) return;
    currentRecipe.ingredients.push({ ingredient: "", quantity: "" });
    renderIngredientSection();

}

function removeIngredientRow(index) {

    if (!currentRecipe) return;
    currentRecipe.ingredients.splice(index, 1);

    if (!currentRecipe.ingredients.length) {
        currentRecipe.ingredients = [{ ingredient: "", quantity: "" }];
    }

    renderIngredientSection();

}

function renderIngredientSection() {

    const container = document.getElementById("ingredientRows");

    if (!container || !currentRecipe) return;

    container.innerHTML = renderIngredientRows(currentRecipe.ingredients || []);
    attachEditorListHandlers();

}

function renderMethodSection() {

    const container = document.getElementById("methodRows");

    if (!container || !currentRecipe) return;

    container.innerHTML = renderMethodRows(currentRecipe.steps || []);
    attachEditorListHandlers();

}

async function handleRecipeSave(event) {

    event.preventDefault();

    const recipe = collectRecipeFromForm();

    if (!recipe) return;

    const validationError = validateRecipe(recipe);

    if (validationError) {
        showEditorFeedback(validationError, true);
        return;
    }

    if (editingRecipeId) {
        const index = recipes.findIndex((item) => item.id === editingRecipeId);
        if (index >= 0) {
            recipes[index] = recipe;
        }
        else {
            recipes.unshift(recipe);
        }
    }
    else {
        recipes.unshift(recipe);
    }

    saveDraft(RECIPES_DRAFT_KEY, recipes);
    if (pendingRecipeImage) {
        try {
            await saveChangedRecipeImage(pendingRecipeImage.filename, pendingRecipeImage.blob);
        }
        catch (error) {
            console.error(error);
            showEditorFeedback("Recipe saved, but the converted image could not be staged for ZIP export.", true);
            currentRecipe = recipe;
            renderRecipeTable();
            return;
        }
    }
    pendingRecipeImage = null;
    currentRecipe = recipe;
    renderRecipeTable();
    showEditorFeedback("Recipe saved. Downloading updated JSON.", false);
    downloadRecipeFile(recipes);

}

function collectRecipeFromForm() {

    if (!currentRecipe) return null;

    const recipe = {
        ...currentRecipe,
        id: getTextFieldValue("recipeId"),
        name: getTextFieldValue("recipeName"),
        description: getTextFieldValue("recipeDescription"),
        category: getTextFieldValue("recipeCategory"),
        prepTime: getNumberFieldValue("recipePrepTime"),
        cookTime: getNumberFieldValue("recipeCookTime"),
        serves: getNumberFieldValue("recipeServes"),
        difficulty: getTextFieldValue("recipeDifficulty"),
        image: getTextFieldValue("recipeImage"),
        tip: getTextFieldValue("recipeTip"),
        ingredients: readIngredientRows(),
        steps: readMethodSteps(),
        nutrition: {
            calories: getNumberFieldValue("nutritionCalories"),
            protein: getNumberFieldValue("nutritionProtein"),
            carbs: getNumberFieldValue("nutritionCarbs"),
            fat: getNumberFieldValue("nutritionFat")
        }
    };

    return recipe;

}

function readIngredientRows() {

    const rows = Array.from(document.querySelectorAll("#ingredientRows tr"));

    return rows.map((row) => {
        const ingredientInput = row.querySelector("input[data-field='ingredient']");
        const typedValue = ingredientInput?.value.trim() || "";
        const ingredientValue = ingredientInput?.dataset.ingredientId || "";
        const ingredient = ingredients.find((item) => {
            return item.id === ingredientValue || item.name?.toLowerCase() === typedValue.toLowerCase();
        });

        return {
            ingredient: ingredient?.id || typedValue,
            quantity: row.querySelector("input[data-field='quantity']")?.value.trim() || ""
        };
    }).filter((row) => row.ingredient || row.quantity);

}

function readMethodSteps() {

    return Array.from(document.querySelectorAll("[data-field='step']"))
        .map((field) => field.value.trim())
        .slice(0, METHOD_STEP_COUNT);

}

function validateRecipe(recipe) {

    if (!recipe.id) {
        return "Recipe ID is required.";
    }

    const duplicateId = recipes.some((item) => item.id === recipe.id && item.id !== editingRecipeId);

    if (duplicateId) {
        return "Recipe ID must be unique.";
    }

    if (!recipe.name) {
        return "Recipe name is required.";
    }

    if (!recipe.description) {
        return "Description is required.";
    }

    if (!recipe.category) {
        return "Category is required.";
    }

    if (!RECIPE_CATEGORIES.includes(recipe.category)) {
        return "Select a valid recipe category.";
    }

    if (!isValidNumber(recipe.prepTime) || Number(recipe.prepTime) < 0) {
        return "Prep time must be a valid non-negative number.";
    }

    if (!isValidNumber(recipe.cookTime) || Number(recipe.cookTime) < 0) {
        return "Cook time must be a valid non-negative number.";
    }

    if (!isValidNumber(recipe.serves) || Number(recipe.serves) < 1) {
        return "Serves must be at least 1.";
    }

    if (!recipe.difficulty) {
        return "Difficulty is required.";
    }

    if (!RECIPE_DIFFICULTIES.includes(recipe.difficulty)) {
        return "Select a valid recipe difficulty.";
    }

    if (!recipe.image) {
        return "Image filename is required.";
    }

    if (!/^rec\d{3}\.jpg$/i.test(recipe.image)) {
        return "Image filename must use the rec###.jpg convention.";
    }

    if (!recipe.tip) {
        return "Chef's tip is required.";
    }

    if (!recipe.ingredients.length) {
        return "At least one ingredient is required.";
    }

    const invalidIngredient = recipe.ingredients.some((row) => !row.ingredient || !isValidNumber(row.quantity) || Number(row.quantity) <= 0);

    if (invalidIngredient) {
        return "Each ingredient row must include a selected ingredient and a positive quantity.";
    }

    const unknownIngredient = recipe.ingredients.find((row) => !ingredients.some((ingredient) => ingredient.id === row.ingredient));

    if (unknownIngredient) {
        return `Ingredient reference does not exist: ${unknownIngredient.ingredient}.`;
    }

    const duplicateIngredients = new Set();
    const repeatedIngredient = recipe.ingredients.find((row) => {
        if (duplicateIngredients.has(row.ingredient)) return true;
        duplicateIngredients.add(row.ingredient);
        return false;
    });

    if (repeatedIngredient) {
        return `Ingredient is listed more than once: ${repeatedIngredient.ingredient}.`;
    }

    if (recipe.steps.length !== METHOD_STEP_COUNT || recipe.steps.some((step) => !step)) {
        return `Exactly ${METHOD_STEP_COUNT} completed method steps are required.`;
    }

    if (!isValidNumber(recipe.nutrition?.calories) || Number(recipe.nutrition.calories) < 0) {
        return "Calories must be a non-negative number.";
    }

    if (!isValidNumber(recipe.nutrition?.protein) || Number(recipe.nutrition.protein) < 0) {
        return "Protein must be a non-negative number.";
    }

    if (!isValidNumber(recipe.nutrition?.carbs) || Number(recipe.nutrition.carbs) < 0) {
        return "Carbohydrates must be a non-negative number.";
    }

    if (!isValidNumber(recipe.nutrition?.fat) || Number(recipe.nutrition.fat) < 0) {
        return "Fat must be a non-negative number.";
    }

    return "";

}

function showEditorFeedback(message, isError) {

    const feedback = document.getElementById("editorFeedback");

    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle("error", Boolean(isError));

}

function downloadRecipeFile(data) {

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "recipes.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);

}

function findRecipeById(recipeId) {

    return recipes.find((recipe) => recipe.id === recipeId) || createBlankRecipe();

}

function getTextFieldValue(id) {

    return document.getElementById(id)?.value.trim() || "";

}

function getNumberFieldValue(id) {

    const value = document.getElementById(id)?.value.trim();

    if (value === "") return null;

    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? numericValue : null;

}

function isValidNumber(value) {

    return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));

}

function renderNumericValue(value) {

    return value === null || value === undefined || value === "" ? "" : value;

}

function cloneRecipe(recipe) {

    return JSON.parse(JSON.stringify(recipe));

}

function escapeHtml(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");

}
