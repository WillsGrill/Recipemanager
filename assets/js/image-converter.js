"use strict";

const imageFilesInput = document.getElementById("imageFiles");
const startingNumberInput = document.getElementById("startingNumber");
const convertImagesButton = document.getElementById("convertImagesButton");
const clearImagesButton = document.getElementById("clearImagesButton");
const converterStatus = document.getElementById("converterStatus");
const imagePreviewGrid = document.getElementById("imagePreviewGrid");

let selectedFiles = [];

imageFilesInput.addEventListener("change", handleImageSelection);
convertImagesButton.addEventListener("click", convertImages);
clearImagesButton.addEventListener("click", clearConverter);

function handleImageSelection() {
    selectedFiles = Array.from(imageFilesInput.files || []);
    convertImagesButton.disabled = !selectedFiles.length;
    renderImagePreviews();
    setStatus(selectedFiles.length ? `${selectedFiles.length} image${selectedFiles.length === 1 ? "" : "s"} ready.` : "");
}

function renderImagePreviews() {
    imagePreviewGrid.innerHTML = selectedFiles.map((file, index) => `
        <article class="image-preview-card">
            <div class="image-preview-frame">
                <img src="${URL.createObjectURL(file)}" alt="Preview of ${escapeHtml(file.name)}">
            </div>
            <div class="image-preview-details">
                <strong>rec${String(getStartingNumber() + index).padStart(3, "0")}.jpg</strong>
                <span>${escapeHtml(file.name)}</span>
            </div>
        </article>
    `).join("");
}

async function convertImages() {
    if (!selectedFiles.length) return;

    const startingNumber = getStartingNumber();
    convertImagesButton.disabled = true;
    setStatus("Converting images...");

    try {
        for (const [index, file] of selectedFiles.entries()) {
            const image = await loadImage(file);
            const jpegBlob = await imageToJpeg(image);
            downloadBlob(jpegBlob, `rec${String(startingNumber + index).padStart(3, "0")}.jpg`);
        }

        setStatus(`${selectedFiles.length} JPEG${selectedFiles.length === 1 ? "" : "s"} downloaded.`);
    }
    catch (error) {
        console.error(error);
        setStatus("One or more images could not be converted.", true);
    }
    finally {
        convertImagesButton.disabled = false;
    }
}

function loadImage(file) {
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

function imageToJpeg(image) {
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
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Unable to create JPEG.")), "image/jpeg", .88);
    });
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

function getStartingNumber() {
    const value = Number.parseInt(startingNumberInput.value, 10);
    return Number.isFinite(value) && value > 0 ? value : 1;
}

function clearConverter() {
    selectedFiles = [];
    imageFilesInput.value = "";
    convertImagesButton.disabled = true;
    imagePreviewGrid.innerHTML = "";
    setStatus("");
}

function setStatus(message, isError = false) {
    converterStatus.textContent = message;
    converterStatus.classList.toggle("error", isError);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
