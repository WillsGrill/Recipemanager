"use strict";

let recipes = [];
let ingredients = [];
let currentRecipe = null;
let editingRecipeId = null;
let activeEditorTab = "general";

document.addEventListener("DOMContentLoaded", initialiseRecipesPage);

function initialiseRecipesPage() {

    const searchInput = document.getElementById("recipeSearch");
    const newRecipeButton = document.getElementById("newRecipeButton");
    const closeEditorButton = document.getElementById("closeEditor");
    const exportRecipesButton = document.getElementById("exportRecipesButton");

    if (searchInput) {
        searchInput.addEventListener("input", () => renderRecipeTable(searchInput.value));
    }

    if (newRecipeButton) {
        newRecipeButton.addEventListener("click", () => openEditor(createBlankRecipe()));
    }

    if (closeEditorButton) {
        closeEditorButton.addEventListener("click", closeEditor);
    }

    if (exportRecipesButton) {
        exportRecipesButton.addEventListener("click", () => exportJSON(CONFIG.recipesFile, "recipes.json"));
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

        recipes = Array.isArray(recipeData) ? recipeData : [];
        ingredients = Array.isArray(ingredientData) ? ingredientData : [];

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

async function exportJSON(path, filename) {
    try {
        const data = await loadJSON(path);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    }
    catch (error) {
        console.error(error);
        alert("Unable to export JSON. Check the console for details.");
    }
}

function renderRecipeTable(searchText = "") {

    const tableBody = document.getElementById("recipeTable");

    if (!tableBody) return;

    const query = searchText.trim().toLowerCase();
    const visibleRecipes = recipes.filter((recipe) => {

        if (!query) return true;

        const recipeMatches = [recipe.id, recipe.name, recipe.category, recipe.description]
            .filter(Boolean)
            .some((value) => value.toString().toLowerCase().includes(query));

        if (recipeMatches) {
            return true;
        }

        return recipeIngredientsMatch(recipe, query);

    });

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
                <button type="button" class="secondary-button" data-action="edit-recipe" data-recipe-id="${escapeHtml(recipe.id || "")}">
                    Edit
                </button>
            </td>
        </tr>
    `).join("");

    tableBody.querySelectorAll("[data-action='edit-recipe']").forEach((button) => {
        button.addEventListener("click", () => openEditor(findRecipeById(button.getAttribute("data-recipe-id"))));
    });

}

function recipeIngredientsMatch(recipe, query) {
    const ingredientReferences = recipe.ingredients
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
        id: "",
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
        steps: [""],
        nutrition: {
            calories: "",
            protein: "",
            carbs: "",
            fat: ""
        },
        tip: ""
    };

}

function openEditor(recipe) {

    if (!recipe) return;

    currentRecipe = cloneRecipe(recipe);
    editingRecipeId = recipe.id || null;
    activeEditorTab = "general";
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
                        <input id="recipeId" value="${escapeHtml(currentRecipe.id || "")}" required>
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
                        <input id="recipeCategory" value="${escapeHtml(currentRecipe.category || "")}" required>
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
                        <input id="recipeDifficulty" value="${escapeHtml(currentRecipe.difficulty || "")}" required>
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
                    <button type="button" class="secondary-button" data-action="add-step">+ Add Step</button>
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
                        <input id="recipeImage" value="${escapeHtml(currentRecipe.image || "")}">
                    </label>
                </div>
            </div>

            <div class="editor-actions">
                <button type="submit" class="primary-button">Save</button>
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

    if (downloadButton) {
        downloadButton.addEventListener("click", () => {
            const recipeToDownload = collectRecipeFromForm();
            if (!recipeToDownload) return;
            downloadRecipeFile(recipeToDownload);
        });
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
                <select data-field="ingredient" data-index="${index}">
                    <option value="">Select ingredient</option>
                    ${ingredients.map((ingredient) => `
                        <option value="${escapeHtml(ingredient.id)}" ${row.ingredient === ingredient.id ? "selected" : ""}>
                            ${escapeHtml(ingredient.id)} - ${escapeHtml(ingredient.name)}
                        </option>
                    `).join("")}
                </select>
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

function renderMethodRows(steps) {

    if (!steps.length) {
        steps = [""];
    }

    return steps.map((step, index) => `
        <div class="method-row">
            <div class="method-label">Step ${index + 1}</div>
            <textarea data-field="step" data-index="${index}" rows="3">${escapeHtml(step)}</textarea>
            <button type="button" class="secondary-button" data-action="remove-step" data-index="${index}">Delete Step</button>
        </div>
    `).join("");

}

function attachEditorListHandlers() {

    const editorContent = document.getElementById("editorContent");

    if (!editorContent) return;

    editorContent.querySelectorAll("[data-action]").forEach((button) => {
        button.addEventListener("click", handleEditorAction);
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

    if (action === "add-step") {
        addMethodStep();
        return;
    }

    if (action === "remove-step") {
        removeMethodStep(Number(button.getAttribute("data-index")));
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

function addMethodStep() {

    if (!currentRecipe) return;
    currentRecipe.steps.push("");
    renderMethodSection();

}

function removeMethodStep(index) {

    if (!currentRecipe) return;
    currentRecipe.steps.splice(index, 1);

    if (!currentRecipe.steps.length) {
        currentRecipe.steps = [""];
    }

    renderMethodSection();

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

function handleRecipeSave(event) {

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

    return rows.map((row) => ({
        ingredient: row.querySelector("select")?.value || "",
        quantity: row.querySelector("input[data-field='quantity']")?.value.trim() || ""
    })).filter((row) => row.ingredient || row.quantity);

}

function readMethodSteps() {

    return Array.from(document.querySelectorAll("[data-field='step']"))
        .map((field) => field.value.trim())
        .filter(Boolean);

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

    if (!recipe.image) {
        return "Image filename is required.";
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

    if (!recipe.steps.length) {
        return "At least one method step is required.";
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
