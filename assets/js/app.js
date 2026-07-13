"use strict";

/* ============================================
   Dashboard
============================================ */

document.addEventListener(

    "DOMContentLoaded",

    initialiseDashboard

);

async function initialiseDashboard() {

    await loadDashboardStats();

}

async function loadDashboardStats() {

    try {

        let recipes =
            await loadJSON(CONFIG.recipesFile);

        let ingredients =
            await loadJSON(CONFIG.ingredientsFile);

        if (!Array.isArray(recipes) || !Array.isArray(ingredients)) {
            throw new Error("Website data must contain recipe and ingredient arrays.");
        }

        recipes = readDraft("willsgrill-recipes-draft", recipes);
        ingredients = readDraft("willsgrill-ingredients-draft", ingredients);

        updateStat(

            "recipeCount",

            recipes.length

        );

        updateStat(

            "ingredientCount",

            ingredients.length

        );

    }

    catch(error){

        console.error(error);

        updateStat("recipeCount","!");

        updateStat("ingredientCount","!");

    }

}

function readDraft(key, fallback) {
    try {
        const draft = JSON.parse(localStorage.getItem(key));
        return Array.isArray(draft) ? draft : fallback;
    }
    catch (error) {
        return fallback;
    }
}

async function loadJSON(path){

    const response = await fetch(path);

    if(!response.ok){

        throw new Error(

            `Unable to load ${path}`

        );

    }

    return await response.json();

}

function updateStat(id,value){

    const element=document.getElementById(id);

    if(!element) return;

    element.textContent=value;

}