const dropBox = document.getElementById("drop-box");
const fileInput = document.getElementById("file-input");
const preview = document.getElementById("preview");
const createBtn = document.getElementById("create-btn");

let storedFiles = [];

// Drag & drop + click file select
dropBox.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", e => handleFiles(e.target.files));
dropBox.addEventListener("dragover", e => e.preventDefault());
dropBox.addEventListener("drop", e => {
  e.preventDefault();
  handleFiles(e.dataTransfer.files);
});

function handleFiles(files) {
  const fileArray = Array.from(files);
  storedFiles.push(...fileArray);

  fileArray.forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = document.createElement("img");
      img.src = e.target.result;
      preview.appendChild(img);
    };
    reader.readAsDataURL(file);
  });
}

// GIF creation using gif-wasm
createBtn.addEventListener("click", async () => {
  if (storedFiles.length === 0) {
    alert("No images to create GIF!");
    return;
  }

  const gifski = new Gifski({ width: 320, height: 240, quality: 80, speed: 10 });

  for (const file of storedFiles) {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => gifski.addFrame(img);
    };
    reader.readAsDataURL(file);
  }

  // Give frames a short moment to load
  setTimeout(async () => {
    const blob = await gifski.compile();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "animated.gif";
    a.click();
  }, 500);
});

