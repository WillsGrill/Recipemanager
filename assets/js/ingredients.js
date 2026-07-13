"use strict";

let ingredients = [];

document.addEventListener("DOMContentLoaded", initialiseIngredientsPage);

function initialiseIngredientsPage() {

    const searchInput = document.getElementById("ingredientSearch");

    if (searchInput) {
        searchInput.addEventListener("input", () => renderIngredientTable(searchInput.value));
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
                <button type="button" class="secondary-button" disabled>
                    Edit
                </button>
            </td>
        </tr>
    `).join("");

}

function escapeHtml(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");

}
