const dropBox = document.getElementById("drop-box");
const fileInput = document.getElementById("file-input");

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
