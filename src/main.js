import { invoke } from "tauri://";

async function load() {
  const data = await invoke("get_first_cards");
  console.log(data);

  const tbody = document.getElementById("cards");
  tbody.innerHTML = "";

  data.forEach(card => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${card.id}</td>
      <td>${card.name}</td>
      <td>${card.card_type}</td>
    `;
    tbody.appendChild(tr);
  });
}

window.onload = load;
