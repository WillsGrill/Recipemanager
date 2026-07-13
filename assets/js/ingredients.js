"use strict";

let ingredients = [];
let currentIngredient = null;
let creatingIngredient = false;

document.addEventListener("DOMContentLoaded", initialiseIngredientsPage);

function initialiseIngredientsPage() {

    const searchInput = document.getElementById("ingredientSearch");
    const exportIngredientsButton = document.getElementById("exportIngredientsButton");
    const newIngredientButton = document.getElementById("newIngredientButton");
    const closeIngredientEditorButton = document.getElementById("closeIngredientEditor");

    if (searchInput) {
        searchInput.addEventListener("input", () => renderIngredientTable(searchInput.value));
    }

    if (exportIngredientsButton) {
        exportIngredientsButton.addEventListener("click", () => exportJSON(CONFIG.ingredientsFile, "ingredients.json"));
    }

    if (newIngredientButton) {
        newIngredientButton.addEventListener("click", () => openIngredientEditor(createBlankIngredient()));
    }

    if (closeIngredientEditorButton) {
        closeIngredientEditorButton.addEventListener("click", closeIngredientEditor);
    }

    loadIngredientData();

}

async function loadIngredientData() {

    try {

        const data = await loadJSON(CONFIG.ingredientsFile);
        ingredients = Array.isArray(data) ? data : [];
        renderIngredientTable();

    }
    catch (error) {

        console.error(error);

        const table = document.getElementById("ingredientTable");

        if (table) {
            table.innerHTML = '<tr><td colspan="5" class="empty-state">Unable to load ingredients.</td></tr>';
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

function renderIngredientTable(searchText = "") {

    const tableBody = document.getElementById("ingredientTable");

    if (!tableBody) return;

    const query = searchText.trim().toLowerCase();
    const visibleIngredients = ingredients.filter((ingredient) => {

        if (!query) return true;

        return [ingredient.id, ingredient.name, ingredient.category, ingredient.unit]
            .filter(Boolean)
            .some((value) => value.toString().toLowerCase().includes(query));

    });

    if (!visibleIngredients.length) {
        tableBody.innerHTML = '<tr><td colspan="5" class="empty-state">No ingredients found.</td></tr>';
        return;
    }

    tableBody.innerHTML = visibleIngredients.map((ingredient) => `
        <tr>
            <td>${escapeHtml(ingredient.id || "")}</td>
            <td>${escapeHtml(ingredient.name || "")}</td>
            <td>${escapeHtml(ingredient.category || "")}</td>
            <td>${escapeHtml(ingredient.unit || "")}</td>
            <td class="edit-action">
                <button type="button" class="secondary-button" data-action="edit-ingredient" data-ingredient-id="${escapeHtml(ingredient.id || "")}">
                    Edit
                </button>
            </td>
        </tr>
    `).join("");

    tableBody.querySelectorAll("[data-action='edit-ingredient']").forEach((button) => {
        button.addEventListener("click", () => openIngredientEditor(findIngredientById(button.getAttribute("data-ingredient-id"))));
    });
}

function findIngredientById(id) {
    if (!id) return null;
    return ingredients.find((ingredient) => ingredient.id === id) || null;
}

function createBlankIngredient() {
    return {
        id: "",
        name: "",
        category: "",
        unit: ""
    };
}

function openIngredientEditor(ingredient) {
    if (!ingredient) return;
    currentIngredient = { ...ingredient };
    creatingIngredient = !ingredient.id;
    renderIngredientEditor();
    const editorPanel = document.getElementById("ingredientEditorPanel");
    if (editorPanel) {
        editorPanel.classList.add("open");
    }
}

function closeIngredientEditor() {
    const editorPanel = document.getElementById("ingredientEditorPanel");
    if (editorPanel) {
        editorPanel.classList.remove("open");
    }
    currentIngredient = null;
    creatingIngredient = false;
}

function renderIngredientEditor() {
    const editorContent = document.getElementById("ingredientEditorContent");
    if (!editorContent || !currentIngredient) return;

    editorContent.innerHTML = `
        <form id="ingredientEditorForm" class="editor-form">
            <div class="field-grid">
                <label class="full-width">
                    Ingredient ID
                    <input id="ingredientId" value="${escapeHtml(currentIngredient.id || generateIngredientId(currentIngredient.category))}" readonly required>
                </label>
                <label class="full-width">
                    Name
                    <input id="ingredientName" value="${escapeHtml(currentIngredient.name || "")}" required>
                </label>
                <label class="full-width">
                    Category
                    <input id="ingredientCategory" list="ingredientCategoryOptions" value="${escapeHtml(currentIngredient.category || "")}"
                        <input id="ingredientCategory" class="category-search-input" list="ingredientCategoryOptions" value="${escapeHtml(currentIngredient.category || "")}"
                           placeholder="Select a category">
                    <datalist id="ingredientCategoryOptions">
                        ${getIngredientCategories().map((category) => `
                            <option value="${escapeHtml(category)}"></option>
                        `).join("")}
                    </datalist>
                </label>
                <label class="full-width">
                    Unit
                    <input id="ingredientUnit" value="${escapeHtml(currentIngredient.unit || "")}">
                </label>
            </div>
            <div class="editor-actions">
                <button type="submit" class="primary-button">Save</button>
                <button type="button" class="secondary-button" id="cancelIngredientEdit">Cancel</button>
            </div>
        </form>
    `;

    const form = document.getElementById("ingredientEditorForm");
    const cancelButton = document.getElementById("cancelIngredientEdit");
    const categoryInput = document.getElementById("ingredientCategory");

    if (categoryInput && creatingIngredient) {
        categoryInput.addEventListener("input", () => {
            const idInput = document.getElementById("ingredientId");
            if (idInput) {
                idInput.value = generateIngredientId(categoryInput.value);
            }
        });
    }

    if (form) {
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            saveIngredientFromEditor();
        });
    }

    if (cancelButton) {
        cancelButton.addEventListener("click", closeIngredientEditor);
    }
}

function getIngredientCategories() {
    return [...new Set(
        ingredients
            .map((ingredient) => (ingredient.category || "").trim())
            .filter(Boolean)
    )].sort((firstCategory, secondCategory) => firstCategory.localeCompare(secondCategory));
}

function saveIngredientFromEditor() {
    const idInput = document.getElementById("ingredientId");
    const nameInput = document.getElementById("ingredientName");
    const categoryInput = document.getElementById("ingredientCategory");
    const unitInput = document.getElementById("ingredientUnit");

    if (!idInput || !nameInput || !categoryInput || !unitInput) return;

    const updatedIngredient = {
        id: creatingIngredient ? generateIngredientId(categoryInput.value) : idInput.value.trim(),
        name: nameInput.value.trim(),
        category: categoryInput.value.trim(),
        unit: unitInput.value.trim()
    };

    const existingIndex = ingredients.findIndex((ingredient) => ingredient.id === currentIngredient.id);

    if (existingIndex >= 0 && currentIngredient.id) {
        ingredients[existingIndex] = updatedIngredient;
    }
    else {
        ingredients.push(updatedIngredient);
    }

    renderIngredientTable();
    closeIngredientEditor();
}

function generateIngredientId(category = "") {
    const typeCode = (category.trim().charAt(0) || "X").toUpperCase();
    const prefix = `ING-${typeCode}-`;
    const nextNumber = ingredients.reduce((highestNumber, ingredient) => {
        const match = (ingredient.id || "").match(new RegExp(`^${prefix}(\\d+)$`, "i"));
        return match ? Math.max(highestNumber, Number(match[1])) : highestNumber;
    }, 0) + 1;

    return `${prefix}${String(nextNumber).padStart(3, "0")}`;
}

function escapeHtml(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");

}
