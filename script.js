// Grab DOM elements
const dropBox = document.getElementById("drop-box");
const fileInput = document.getElementById("file-input");
const preview = document.getElementById("preview");
const createBtn = document.getElementById("create-btn");
const progressBar = document.getElementById("progress-bar");

let storedFiles = [];

// --- Drag & Drop / Click ---
dropBox.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", e => handleFiles(e.target.files));

dropBox.addEventListener("dragover", e => {
  e.preventDefault();
  dropBox.classList.add("drag-over");
});

dropBox.addEventListener("dragleave", e => {
  dropBox.classList.remove("drag-over");
});

dropBox.addEventListener("drop", e => {
  e.preventDefault();
  dropBox.classList.remove("drag-over");
  handleFiles(e.dataTransfer.files);
});

// --- Handle Selected Files ---
function handleFiles(files) {
  const fileArray = Array.from(files);
  storedFiles.push(...fileArray);

  fileArray.forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = document.createElement("img");
      img.src = e.target.result;
      img.style.maxWidth = "80px";
      img.style.margin = "5px";
      preview.appendChild(img);
    };
    reader.readAsDataURL(file);
  });

  if (storedFiles.length > 0) {
    createBtn.disabled = false;
  }
}

// --- Create GIF using Render Backend ---
createBtn.addEventListener("click", async () => {
  if (storedFiles.length === 0) {
    alert("No images selected!");
    return;
  }

  const formData = new FormData();
  storedFiles.forEach(file => formData.append("images", file));

  // Reset progress bar
  progressBar.style.width = "0%";

  try {
    const response = await fetch("https://gif-backend-hvq2.onrender.com/create-gif", {
      method: "POST",
      body: formData
    });

    if (!response.ok) throw new Error("Failed to create GIF");

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "animated.gif";
    a.click();

    progressBar.style.width = "100%";
    setTimeout(() => progressBar.style.width = "0%", 500);

    // Clear preview & files
    preview.innerHTML = "";
    storedFiles = [];
    createBtn.disabled = true;

  } catch (err) {
    console.error(err);
    alert("Error creating GIF: " + err.message);
  }
});
