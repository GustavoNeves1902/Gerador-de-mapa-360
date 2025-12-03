// gerador.js (versão corrigida)
// ==============================

let viewer;
let scenes = {};
let currentScene = null;
let addingHotspot = false;
let zipBlobGlobal = null;

// ---------- UI: showAlert (não sobrescreve window.onclick) ----------
window.showAlert = function (mensagem) {
  const modal = document.getElementById("customAlert");
  const msg = document.getElementById("customAlertMsg");
  const btn = document.getElementById("customAlertBtn");

  msg.textContent = mensagem;
  modal.style.display = "block";

  // garante que o botão fecha o modal (reattacha sem duplicar handlers)
  btn.onclick = function () {
    modal.style.display = "none";
  };
};

// Fecha customAlert ao clicar fora — atrelado apenas uma vez
(function attachGlobalModalClick() {
  const modal = document.getElementById("customAlert");
  if (!modal) return;
  window.addEventListener("click", (event) => {
    if (event.target === modal) modal.style.display = "none";
  });
})();

// ---------- Criação / (Re)configuração do viewer ----------
function setupViewer(initialScenes = {}) {
  // destrói viewer antigo se existir
  try {
    if (viewer && typeof viewer.destroy === "function") viewer.destroy();
  } catch (e) {
    console.warn("Erro ao destruir viewer antigo:", e);
  }

  // cria o viewer com as cenas passadas (pode ser vazio)
  viewer = pannellum.viewer("viewer", {
    default: { firstScene: null, autoLoad: true },
    scenes: initialScenes,
  });

  // sempre (re)ata o evento scenechange para manter currentScene atualizado
  viewer.on("scenechange", (sceneId) => {
    currentScene = sceneId;
    atualizarListaHotspots();
    atualizarListaCenas();
  });

  // atacha o handler de mousedown para hotspots
  viewer.on("mousedown", (event) => {
    if (!addingHotspot) return;

    if (!currentScene) {
      // fallback seguro
      showAlert("Nenhuma cena ativa.");
      addingHotspot = false;
      return;
    }

    const coords = viewer.mouseEventToCoords(event);
    const pitch = coords[0],
      yaw = coords[1];

    const destino = prompt("Digite o ID da cena de destino:");
    if (!destino || !scenes[destino]) {
      showAlert("Destino inválido!");
      addingHotspot = false;
      return;
    }

    const nomeDestino = scenes[destino].nome || destino;
    let targetYaw = prompt(
      `Hotspot para '${nomeDestino}' (ID: ${destino}).\nDigite o ângulo de rotação (Yaw) ao chegar (ex: 0, 90, -45).`
    );
    targetYaw = parseFloat(targetYaw);
    if (isNaN(targetYaw)) {
      if (!confirm("Valor inválido. Usar 0?")) {
        addingHotspot = false;
        return;
      }
      targetYaw = 0;
    }

    const hotspotId =
      "hspot_" +
      Date.now() +
      "_" +
      Math.random()
        .toString(36)
        .substring(2, 9);

    const hotspot = {
      id: hotspotId,
      pitch,
      yaw,
      type: "scene",
      text: encodeURIComponent(`Ir para ${nomeDestino}`),
      sceneId: destino,
      targetYaw,
    };

    // salva no modelo e no viewer
    scenes[currentScene].hotSpots.push(hotspot);
    try {
      viewer.addHotSpot({ ...hotspot, text: `Ir para ${nomeDestino}` }, currentScene);
    } catch (e) {
      console.warn("Erro ao adicionar hotspot no viewer:", e);
    }

    showAlert("Hotspot adicionado!");
    atualizarListaHotspots();
    addingHotspot = false;
  });
}

// Inicializa ao carregar a página
window.addEventListener("DOMContentLoaded", () => {
  // valida libs
  if (typeof JSZip === "undefined" || typeof pannellum === "undefined") {
    showAlert("JSZip e/ou Pannellum não carregaram! Verifique a conexão ou os scripts.");
    return;
  }
  if (typeof QRCode === "undefined") {
    console.warn("qrcode.min.js não carregado — QR Code não funcionará.");
  }

  // cria viewer vazio inicialmente
  setupViewer({});

  // reata botões e lógica
  bindUI();
  atualizarListaCenas();
  atualizarListaHotspots();
});

// ---------- UI Bindings ----------
function bindUI() {
  document.getElementById("addScene").addEventListener("click", onAddScene);
  document.getElementById("removeScene").addEventListener("click", () => {
    if (!currentScene) return showAlert("Nenhuma cena ativa para remover.");
    removerCena(currentScene);
  });
  document.getElementById("addHotspot").addEventListener("click", () => {
    if (!currentScene) return showAlert("Carregue uma cena primeiro.");
    addingHotspot = true;
    showAlert("Modo de hotspot ativado. Clique no panorama para definir a posição.");
  });

  // download / QR
  document.getElementById("downloadPanorama").addEventListener("click", onExport);

  // modal passo-a-passo
  const btnPasso = document.getElementById("passoAPasso");
  const modalP = document.getElementById("modalPasso");
  const spanCloseP = modalP ? modalP.querySelector(".close") : null;
  if (btnPasso && modalP) {
    btnPasso.addEventListener("click", () => (modalP.style.display = "block"));
    if (spanCloseP) spanCloseP.addEventListener("click", () => (modalP.style.display = "none"));
  }

  // modal QR close
  const closeQR = document.querySelector(".close-qr");
  if (closeQR) closeQR.addEventListener("click", () => (document.getElementById("modalQR").style.display = "none"));

  // click fora para fechar modalQR (não sobrescreve outros handlers)
  window.addEventListener("click", (event) => {
    const modalQR = document.getElementById("modalQR");
    if (event.target === modalQR) modalQR.style.display = "none";
  });
}

// ---------- Adicionar Cena ----------
function onAddScene() {
  const fileInput = document.getElementById("fileInput");
  const id = document.getElementById("imageId").value.trim();
  if (!fileInput.files[0] || !id) {
    return showAlert("Selecione uma imagem e insira um ID.");
  }

  if (scenes[id]) {
    return showAlert(`ID '${id}' já existe. Escolha outro.`);
  }

  const file = fileInput.files[0];
  const reader = new FileReader();
  reader.onload = function (e) {
    const dataUrl = e.target.result;
    const nomeImagem = file.name.replace(/\.[^/.]+$/, "");

    // salva modelo
    scenes[id] = {
      type: "equirectangular",
      nome: nomeImagem,
      file: file,
      dataURL: dataUrl,
      hotSpots: [],
    };

    // adicionar cena no viewer
    try {
      viewer.addScene(id, {
        type: "equirectangular",
        panorama: dataUrl,
        hotSpots: [],
      });
    } catch (e) {
      console.warn("Erro ao adicionar cena diretamente — recriando viewer com as cenas:", e);
      // se deu ruim, reconstrói viewer com todas as cenas atuais em objectURLs
      rebuildViewerFromScenes();
    }

    // Se era a primeira cena (antes de adicionar só havia 0), torne ativa
    if (Object.keys(scenes).length === 1 || !currentScene) {
      try {
        viewer.loadScene(id);
        currentScene = id;
      } catch (e) {
        console.warn("Erro ao carregar cena recém adicionada:", e);
      }
    }

    showAlert(`Cena '${nomeImagem}' adicionada como ID '${id}'!`);
    atualizarListaCenas();
  };
  reader.readAsDataURL(file);
}

// ---------- Remover Cena ----------
function removerCena(sceneIdToRemove) {
  if (!sceneIdToRemove || !scenes[sceneIdToRemove]) {
    return showAlert("Nenhuma cena selecionada ou cena não existe.");
  }

  if (!confirm(`Tem certeza que deseja remover a cena '${scenes[sceneIdToRemove].nome || sceneIdToRemove}'?`)) {
    return;
  }

  const nomeRemovido = scenes[sceneIdToRemove].nome || sceneIdToRemove;
  delete scenes[sceneIdToRemove];

  // remove hotspots que apontam para a cena removida
  for (const id in scenes) {
    scenes[id].hotSpots = scenes[id].hotSpots.filter((h) => !(h.type === "scene" && h.sceneId === sceneIdToRemove));
  }

  // Se ainda restam cenas, reconstruir viewer para garantir handlers funcionais
  if (Object.keys(scenes).length > 0) {
    rebuildViewerFromScenes();
    const first = Object.keys(scenes)[0];
    try {
      viewer.loadScene(first);
      currentScene = first;
    } catch (e) {
      console.warn("Erro ao carregar primeira cena após remoção:", e);
    }
  } else {
    // nenhuma cena restante: criar viewer vazio
    setupViewer({});
    currentScene = null;
  }

  showAlert(`Cena '${nomeRemovido}' removida com sucesso.`);
  atualizarListaCenas();
  atualizarListaHotspots();
}

// ---------- Reconstruir viewer usando as cenas em `scenes` ----------
function rebuildViewerFromScenes() {
  const configScenes = {};
  for (const id in scenes) {
    const s = scenes[id];
    // prefere dataURL (se disponível), senão cria objectURL temporário
    const panorama = s.dataURL || (s.file ? URL.createObjectURL(s.file) : null);
    configScenes[id] = { type: s.type, panorama, hotSpots: (s.hotSpots || []).map(h => ({ ...h, text: decodeURIComponent(h.text || "") })) };
  }

  setupViewer(configScenes);

  // adicionar hotspots re-registrando-os no viewer (garante objetos corretos)
  for (const id in scenes) {
    const s = scenes[id];
    (s.hotSpots || []).forEach(h => {
      try {
        viewer.addHotSpot({ ...h, text: decodeURIComponent(h.text || "") }, id);
      } catch (e) {
        // ignore se algo falhar por causa de dados antigos
      }
    });
  }
}

// ---------- Hotspot: remover / editar ----------
window.removerHotspot = function (hotSpotId) {
  if (!currentScene) return showAlert("Nenhuma cena ativa.");
  const sceneId = currentScene;
  const hotspot = scenes[sceneId]?.hotSpots.find((h) => h.id === hotSpotId);
  if (!hotspot) return showAlert("Erro interno.");

  if (!confirm(`Remover hotspot?`)) return;

  try {
    viewer.removeHotSpot(hotSpotId, sceneId);
  } catch (e) {}

  scenes[sceneId].hotSpots = scenes[sceneId].hotSpots.filter((h) => h.id !== hotSpotId);
  showAlert(`Hotspot removido!`);
  atualizarListaHotspots();
};

window.editarHotspot = function (hotSpotId) {
  if (!currentScene) return showAlert("Nenhuma cena ativa.");
  const sceneId = currentScene;
  const hotspotIndex = scenes[sceneId]?.hotSpots.findIndex((h) => h.id === hotSpotId);
  if (hotspotIndex === -1) return showAlert("Hotspot não encontrado.");

  const hotspot = scenes[sceneId].hotSpots[hotspotIndex];
  const novoDestino = prompt(`Novo ID destino (Atual: ${hotspot.sceneId}):`, hotspot.sceneId);
  if (novoDestino === null) return;
  if (!scenes[novoDestino]) return showAlert(`Destino inválido.`);

  let novoTargetYaw = prompt(`Novo Target Yaw:`, hotspot.targetYaw);
  if (novoTargetYaw === null) return;
  novoTargetYaw = parseFloat(novoTargetYaw);
  if (isNaN(novoTargetYaw)) return showAlert("Yaw inválido.");

  const nomeDestinoNovo = scenes[novoDestino].nome || novoDestino;
  hotspot.sceneId = novoDestino;
  hotspot.targetYaw = novoTargetYaw;
  hotspot.text = encodeURIComponent(`Ir para ${nomeDestinoNovo}`);

  try { viewer.removeHotSpot(hotSpotId, sceneId); } catch (e) {}
  viewer.addHotSpot({ ...hotspot, text: `Ir para ${nomeDestinoNovo}` }, sceneId);
  showAlert(`Hotspot editado!`);
  atualizarListaHotspots();
};

// ---------- UI: atualizar listas ----------
function atualizarListaHotspots() {
  let listContainer = document.getElementById("hotspotListContainer");
  if (!listContainer) {
    listContainer = document.createElement("div");
    listContainer.id = "hotspotListContainer";
    document.body.insertBefore(listContainer, document.getElementById("viewer"));
  }
  listContainer.innerHTML = "";
  if (!currentScene || !scenes[currentScene]) {
    listContainer.style.display = "none";
    return;
  }
  listContainer.style.display = "block";

  const currentSceneData = scenes[currentScene];
  const title = document.createElement("h4");
  title.textContent = `Hotspots em "${currentSceneData.nome || currentScene}":`;
  listContainer.appendChild(title);

  if (!currentSceneData.hotSpots || currentSceneData.hotSpots.length === 0) {
    listContainer.innerHTML += "<p>Nenhum hotspot.</p>";
    return;
  }

  const ul = document.createElement("ul");
  ul.style.listStyle = "none";
  ul.style.padding = "0";
  ul.style.maxHeight = "200px";
  ul.style.overflowY = "auto";

  currentSceneData.hotSpots.forEach((hotspot) => {
    const li = document.createElement("li");
    li.style.margin = "5px 0";
    li.style.padding = "5px";
    li.style.borderBottom = "1px dotted #ccc";

    const btnRemove = document.createElement("button");
    btnRemove.textContent = "X";
    btnRemove.style.cssText = "margin-left:10px; background:#dc3545; color:white; border:none; cursor:pointer;";
    btnRemove.onclick = () => window.removerHotspot(hotspot.id);

    const btnEdit = document.createElement("button");
    btnEdit.textContent = "Editar";
    btnEdit.style.cssText = "margin-left:5px; background:#ffc107; color:black; border:none; cursor:pointer;";
    btnEdit.onclick = () => window.editarHotspot(hotspot.id);

    const destinoNome = scenes[hotspot.sceneId]?.nome || hotspot.sceneId;
    li.innerHTML = `→ ${destinoNome} (Yaw: ${hotspot.yaw.toFixed(0)})`;
    li.appendChild(btnEdit);
    li.appendChild(btnRemove);
    ul.appendChild(li);
  });

  listContainer.appendChild(ul);
}

function atualizarListaCenas() {
  let existingSelectContainer = document.getElementById("sceneSelectContainer");
  if (existingSelectContainer) existingSelectContainer.remove();

  const select = document.createElement("select");
  select.id = "sceneSelect";
  const container = document.createElement("div");
  container.id = "sceneSelectContainer";
  container.style.padding = "10px";
  container.style.textAlign = "center";
  container.appendChild(select);

  Object.keys(scenes).forEach((id) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = scenes[id].nome || id;
    select.appendChild(opt);
  });

  if (currentScene && scenes[currentScene]) select.value = currentScene;
  else if (Object.keys(scenes).length > 0) select.value = Object.keys(scenes)[0];

  select.addEventListener("change", (e) => {
    viewer.loadScene(e.target.value);
    currentScene = e.target.value;
  });

  if (Object.keys(scenes).length > 0) document.body.insertBefore(container, document.getElementById("viewer"));
}

// ---------- Export / QR (mantive lógica similar à sua) ----------
function converterCenasParaDataURL() {
  const promises = [];
  for (const id in scenes) {
    const scene = scenes[id];
    if (scene.file && !scene.dataURL) {
      promises.push(
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = function (e) {
            scene.dataURL = e.target.result;
            resolve();
          };
          reader.readAsDataURL(scene.file);
        })
      );
    }
  }
  return Promise.all(promises);
}

function gerarHTMLCompleto() {
  const scenesData = {};
  let firstSceneId = null;
  for (const id in scenes) {
    const s = scenes[id];
    if (!firstSceneId) firstSceneId = id;
    scenesData[id] = {
      type: s.type,
      panorama: s.dataURL,
      nome: encodeURIComponent(s.nome),
      hotSpots: s.hotSpots.map((h) => ({
        pitch: h.pitch,
        yaw: h.yaw,
        type: h.type,
        text: h.text,
        sceneId: h.sceneId,
        targetYaw: h.targetYaw,
      })),
    };
  }

  const navigationMenuHTML = `
    <div id="scene-nav-menu" style="position:fixed; top:10px; left:10px; z-index:9999; background: rgba(0,0,0,0.6); padding: 5px; border-radius: 5px;">
      <label style="color:white; font-weight:bold; font-size: 14px;">Ir para:</label>
      <select id="jumpToScene" onchange="viewer.loadScene(this.value);">
        ${Object.keys(scenesData).map((id) => `<option value="${id}" ${id === firstSceneId ? "selected" : ""}>${decodeURIComponent(scenesData[id].nome)}</option>`).join("")}
      </select>
    </div>
  `;
  const serializedScenes = JSON.stringify(scenesData);

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>360</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css"/><script src="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js"></script><style>body{margin:0;overflow:hidden}#viewer{width:100%;height:100vh}#scene-nav-menu label,#scene-nav-menu select{vertical-align:middle}</style></head><body>${navigationMenuHTML}<div id="viewer"></div><script>let viewer;const scenes=${serializedScenes};Object.keys(scenes).forEach(id=>{scenes[id].title=decodeURIComponent(scenes[id].nome);scenes[id].hotSpots.forEach(h=>{h.text=decodeURIComponent(h.text)})});viewer=pannellum.viewer('viewer',{default:{firstScene:'${firstSceneId}',autoLoad:true},scenes:scenes});window.viewer=viewer;</script></body></html>`;
}

async function onExport() {
  if (Object.keys(scenes).length === 0) return showAlert("Nenhuma cena adicionada!");

  const choice = confirm(
    "Deseja gerar um QR Code para baixar no celular?\n\n[OK] = Sim, gerar QR Code.\n[Cancelar] = Não, apenas baixar no PC."
  );

  try {
    showAlert("Preparando imagens e gerando ZIP... Aguarde.");
    await converterCenasParaDataURL();

    const zip = new JSZip();
    for (const id in scenes) {
      if (scenes[id].file) zip.file(scenes[id].file.name, scenes[id].file);
    }
    zip.file("index.html", gerarHTMLCompleto());

    zipBlobGlobal = await zip.generateAsync({ type: "blob" });

    if (!choice) {
      baixarArquivo(zipBlobGlobal);
    } else {
      if (typeof QRCode === "undefined") {
        showAlert("Biblioteca QRCode não encontrada. Baixando localmente.");
        return baixarArquivo(zipBlobGlobal);
      }

      const modalQR = document.getElementById("modalQR");
      const qrCanvas = document.getElementById("qrcodeCanvas");
      const qrStatus = document.getElementById("qrStatus");

      qrCanvas.innerHTML = "";
      qrStatus.innerText = "Enviando arquivo para nuvem temporária...";
      modalQR.style.display = "flex";

      const formData = new FormData();
      formData.append("file", zipBlobGlobal, "panorama_360.zip");

      const response = await fetch("https://tmpfiles.org/api/v1/upload", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === "success") {
          const downloadUrl = data.data.url;
          qrStatus.innerText = "Escaneie para baixar (Link expira em 60min):";
          new QRCode(qrCanvas, {
            text: downloadUrl,
            width: 200,
            height: 200,
          });
        } else {
          throw new Error("Serviço recusou o arquivo.");
        }
      } else {
        throw new Error(`Erro de upload: ${response.status}`);
      }
    }
  } catch (err) {
    console.error(err);
    showAlert(`Ocorreu um erro: ${err.message}.\nBaixando arquivo localmente.`);
    if (zipBlobGlobal) baixarArquivo(zipBlobGlobal);
    document.getElementById("modalQR").style.display = "none";
  }
}

function baixarArquivo(blob) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `panorama_360.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
