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

        const recipes =
            await loadJSON(CONFIG.recipesFile);

        const ingredients =
            await loadJSON(CONFIG.ingredientsFile);

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