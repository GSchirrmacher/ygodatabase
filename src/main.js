import { invoke } from "@tauri-apps/api/tauri";

async function loadImages() {
  const container = document.getElementById("images");
  const images = await invoke("get_first_10_card_images");

  images.forEach(img => {
    const elem = document.createElement("img");
    elem.src = `data:image/jpeg;base64,${img.base64}`;
    elem.style.width = "150px";
    elem.style.margin = "10px";
    container.appendChild(elem);
  });
}

window.addEventListener("DOMContentLoaded", loadImages);
