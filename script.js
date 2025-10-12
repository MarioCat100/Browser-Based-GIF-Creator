const dropBox = document.getElementById("drop-box");
const fileInput = document.getElementById("file-input");

// Make sure storedFiles is declared once at the top
let storedFiles = []; 

// Click to open file dialog
dropBox.addEventListener("click", () => fileInput.click());

// Handle files selected via input
fileInput.addEventListener("change", (e) => {
  handleFiles(e.target.files);
});

// Handle drag & drop
dropBox.addEventListener("dragover", (e) => e.preventDefault());
dropBox.addEventListener("drop", (e) => {
  e.preventDefault();
  handleFiles(e.dataTransfer.files);
});

function handleFiles(files) {
  console.log("Files dropped:", files);
  // You can process images here to create GIFs
}

function handleFiles(files) {
  const fileArray = Array.from(files);
  storedFiles.push(...fileArray);
  fileArray.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement("img");
      img.src = e.target.result;
      img.style.width = "100px";
      img.style.margin = "5px";
      dropBox.appendChild(img);
    };
    reader.readAsDataURL(file);
  });
}

async function createGIF() {
  if (storedFiles.length === 0) {
    alert("No images to create GIF!");
    return;
  }

  const gif = new Gifski({
    width: 320,
    height: 240,
    quality: 80,
    speed: 10,
  });

  for (const file of storedFiles) {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target.result;
      img.onload = () => {
        gif.addFrame(img);
        if (gif.frames.length === storedFiles.length) {
          const blob = gif.compile();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "animated.gif";
          a.click();
        }
      };
    };
    reader.readAsDataURL(file);
  }
}

// Add a button to trigger GIF creation
const createButton = document.createElement("button");
createButton.textContent = "Create GIF";
createButton.style.marginTop = "20px";
createButton.onclick = createGIF;
document.body.appendChild(createButton);
