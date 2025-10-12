const dropBox = document.getElementById("drop-box");
const fileInput = document.getElementById("file-input");
const preview = document.getElementById("preview");
const createBtn = document.getElementById("create-btn");
const progressBar = document.getElementById("progress-bar");

let storedFiles = [];

// Drag & drop / click
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

// Create GIF using gifski-wasm
createBtn.addEventListener("click", async () => {
  if (storedFiles.length === 0) {
    alert("No images selected!");
    return;
  }

  // Initialize gifski
  const gifski = new Gifski({
    width: 320,
    height: 240,
    quality: 80,
    speed: 10,
    progress: (p) => {
      progressBar.style.width = Math.floor(p*100)+"%";
    }
  });

  // Add frames asynchronously
  for (const file of storedFiles) {
    await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.src = e.target.result;
        img.onload = () => {
          gifski.addFrame(img);
          resolve();
        };
      };
      reader.readAsDataURL(file);
    });
  }

  // Compile GIF
  const blob = await gifski.compile();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "animated.gif";
  a.click();

  progressBar.style.width = "100%";
  setTimeout(()=>progressBar.style.width="0%", 500);
});

