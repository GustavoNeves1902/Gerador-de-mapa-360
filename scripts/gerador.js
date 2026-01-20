const supabaseClient = window.supabaseClient;

let viewer;
let scenes = {};
let currentScene = null;
let addingHotspot = false;
let hotspotEmEdicao = null;

// ---------- UI: showAlert ----------
window.showAlert = function (mensagem) {
  const modal = document.getElementById("customAlert");
  const msg = document.getElementById("customAlertMsg");
  const btn = document.getElementById("customAlertBtn");

  if (!modal) return;

  msg.textContent = mensagem;

  btn.style.display = "block";
  btn.disabled = false;
  btn.onclick = () => (modal.style.display = "none");

  modal.style.display = "flex";
};

window.showLoading = function (mensagem = "Aguarde...") {
  const modal = document.getElementById("customAlert");
  const msg = document.getElementById("customAlertMsg");
  const btn = document.getElementById("customAlertBtn");

  if (!modal) return;

  msg.textContent = mensagem;

  // 🔒 bloqueia o botão
  btn.style.display = "none";
  btn.disabled = true;

  modal.style.display = "flex";
};

window.hideLoading = function () {
  const modal = document.getElementById("customAlert");
  if (!modal) return;

  modal.style.display = "none";
};

(function attachGlobalModalClick() {
  window.addEventListener("click", (event) => {
    const modal = document.getElementById("customAlert");
    const btn = document.getElementById("customAlertBtn");

    // só permite fechar se o botão estiver visível (modo alerta)
    if (event.target === modal && btn.style.display !== "none") {
      modal.style.display = "none";
    }
  });
})();

// ---------- Criação / (Re)configuração do viewer ----------
let mouseDownPos = { x: 0, y: 0 };

function setupViewer(initialScenes = {}) {
  try {
    if (viewer && typeof viewer.destroy === "function") viewer.destroy();
  } catch (e) {}

  viewer = pannellum.viewer("viewer", {
    default: { firstScene: null, autoLoad: true },
    scenes: initialScenes,
  });

  // Registra onde o mouse desceu
  viewer.on("mousedown", (event) => {
    mouseDownPos = { x: event.clientX, y: event.clientY };
  });

  // Verifica na subida se foi um clique parado ou um arrasto
  viewer.on("mouseup", (event) => {
    if (!addingHotspot || !currentScene) return;

    // Calcula a distância do movimento
    const moveX = Math.abs(event.clientX - mouseDownPos.x);
    const moveY = Math.abs(event.clientY - mouseDownPos.y);

    // Se moveu mais de 5 pixels, o usuário estava girando a imagem
    if (moveX > 5 || moveY > 5) return;

    // Se chegou aqui, foi um clique legítimo para adicionar
    const coords = viewer.mouseEventToCoords(event);
    const pitch = coords[0];
    const yaw = coords[1];

    const destino = prompt("Digite o ID da cena de destino:");
    if (!destino || !scenes[destino]) {
      showAlert("Destino inválido ou cena não encontrada!");
      addingHotspot = false;
      return;
    }

    let targetYaw = prompt(
      `Hotspot para '${
        scenes[destino].nome || destino
      }'.\nDigite o Yaw ao chegar (ex: 0, 90):`,
      "0"
    );
    targetYaw = parseFloat(targetYaw) || 0;

    const hotspotId = "hspot_" + Date.now();
    const hotspot = {
      id: hotspotId,
      pitch: pitch,
      yaw: yaw,
      type: "scene",
      text: encodeURIComponent(`Ir para ${scenes[destino].nome || destino}`),
      sceneId: destino,
      targetYaw: targetYaw,
    };

    scenes[currentScene].hotSpots.push(hotspot);

    try {
      viewer.addHotSpot(
        {
          ...hotspot,
          text: decodeURIComponent(hotspot.text),
        },
        currentScene
      );
    } catch (e) {
      console.error("Erro ao renderizar hotspot:", e);
    }

    addingHotspot = false;
    atualizarListaHotspots();
    showAlert("Hotspot adicionado com sucesso!");
  });

  viewer.on("scenechange", (sceneId) => {
    currentScene = sceneId;
    atualizarListaHotspots();
    atualizarListaCenas();
  });
}

// ---------- Inicialização ----------
window.addEventListener("DOMContentLoaded", async () => {
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  setupViewer({});
  bindUI();
});

function bindUI() {
  document.getElementById("addScene").addEventListener("click", onAddScene);
  document.getElementById("removeScene").addEventListener("click", () => {
    if (!currentScene) return showAlert("Nenhuma cena ativa.");
    removerCena(currentScene);
  });
  document.getElementById("addHotspot").addEventListener("click", () => {
    if (!currentScene) return showAlert("Carregue uma cena primeiro.");
    addingHotspot = true;
    showAlert("Modo hotspot: clique no panorama.");
  });
  document
    .getElementById("salvarPlataforma")
    .addEventListener("click", salvarNoSupabase);

  const btnPasso = document.getElementById("passoAPasso");
  if (btnPasso)
    btnPasso.onclick = () =>
      (document.getElementById("modalPasso").style.display = "block");

  const modalPasso = document.getElementById("modalPasso");
  const closeBtn = modalPasso.querySelector(".close");

  closeBtn.onclick = () => {
    modalPasso.style.display = "none";
  };

  window.addEventListener("click", (event) => {
    if (event.target === modalPasso) {
      modalPasso.style.display = "none";
    }
  });
}

async function converterCenasParaDataURL() {
  const promises = [];

  for (const id in scenes) {
    const scene = scenes[id];

    if (scene.file && !scene.dataURL) {
      promises.push(
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
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

function baixarArquivo(blob) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "panorama_360.zip";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function gerarHTMLCompleto() {
  const scenesData = {};
  let firstSceneId = null;

  for (const id in scenes) {
    const s = scenes[id];
    if (!firstSceneId) firstSceneId = id;

    scenesData[id] = {
      type: "equirectangular",
      panorama: s.dataURL,
      nome: encodeURIComponent(s.nome || id),
      hotSpots: (s.hotSpots || []).map((h) => ({
        pitch: h.pitch,
        yaw: h.yaw,
        type: h.type,
        text: h.text,
        sceneId: h.sceneId,
        targetYaw: h.targetYaw,
      })),
    };
  }

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Panorama 360</title>

<link rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css" />
<script src="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js"></script>

<style>
body { margin:0; overflow:hidden; background:#000 }
#viewer { width:100%; height:100vh }
#menu {
  position: fixed;
  top: 10px;
  left: 10px;
  z-index: 9999;
  background: rgba(0,0,0,.6);
  padding: 6px;
  border-radius: 6px;
}
#menu label { color:white; font-weight:bold }
</style>
</head>

<body>

<div id="menu">
  <label>Ir para:</label>
  <select id="jump"></select>
</div>

<div id="viewer"></div>

<script>
const scenes = ${JSON.stringify(scenesData)};

Object.values(scenes).forEach(s => {
  s.hotSpots.forEach(h => h.text = decodeURIComponent(h.text));
});

const viewer = pannellum.viewer("viewer", {
  default: {
    firstScene: "${firstSceneId}",
    autoLoad: true
  },
  scenes
});

const select = document.getElementById("jump");
Object.keys(scenes).forEach(id => {
  const opt = document.createElement("option");
  opt.value = id;
  opt.textContent = decodeURIComponent(scenes[id].nome);
  select.appendChild(opt);
});

select.value = "${firstSceneId}";
select.onchange = () => viewer.loadScene(select.value);
</script>

</body>
</html>
`;
}

// ---------- SALVAR NO SUPABASE ----------
async function salvarNoSupabase() {
  if (Object.keys(scenes).length === 0)
    return showAlert("Adicione pelo menos uma cena!");

  try {
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    showLoading("Publicando no dashboard...");

    // 1. Garantir que todas as imagens estão em DataURL (Base64)
    await converterCenasParaDataURL();

    // 2. Definir o nome do projeto e o nome da pasta (ID Único)
    const nomeProjeto = document.getElementById("nome").value || "Tour 360";

    // ESTA LINHA É A QUE ESTAVA FALTANDO OU COM ERRO:
    const folderName = `tour_${Date.now()}`;

    // 3. Gerar o HTML (caso você ainda queira salvar o arquivo no Storage para visualização rápida)
    const htmlFinal = gerarHTMLCompleto();
    const filePath = `${user.id}/${folderName}/index.html`;

    const blob = new Blob([htmlFinal], { type: "text/html" });

    // Faz o upload para o Storage (opcional, mas bom para o botão "Visualizar")
    await supabaseClient.storage.from("panoramas").upload(filePath, blob, {
      contentType: "text/html",
      upsert: true,
    });

    const { data: urlData } = supabaseClient.storage
      .from("panoramas")
      .getPublicUrl(filePath);

    // 4. SALVAR NO BANCO DE DADOS
    const { error: dbError } = await supabaseClient.from("panoramas").insert([
      {
        user_id: user.id,
        nome_projeto: nomeProjeto,
        pasta_nome: folderName, // <--- AQUI GARANTIMOS QUE O VALOR NÃO É NULL
        url_index: urlData.publicUrl,
        thumb_url: scenes[Object.keys(scenes)[0]].dataURL,
        estrutura_json: Object.fromEntries(
          Object.entries(scenes).map(([id, s]) => [
            id,
            {
              type: s.type,
              nome: s.nome,
              dataURL: s.dataURL,
              hotSpots: s.hotSpots || [],
            },
          ])
        ), // Salvando o objeto completo para o ZIP na Dashboard
      },
    ]);

    if (dbError) throw dbError;
    hideLoading();
    showAlert("✅ Publicado com sucesso!");
    setTimeout(() => (window.location.href = "dashboard.html"), 1500);
  } catch (err) {
    hideLoading();
    showAlert("Erro: " + err.message);
  }
}

// ---------- Lógica de Cenas e Hotspots (Sua Lógica Original) ----------
function onAddScene() {
  const fileInput = document.getElementById("fileInput");
  const id = document.getElementById("imageId").value.trim();
  if (!fileInput.files[0] || !id) return showAlert("Selecione imagem e ID.");

  const file = fileInput.files[0];
  const reader = new FileReader();
  reader.onload = (e) => {
    scenes[id] = {
      type: "equirectangular",
      nome: file.name.replace(/\.[^/.]+$/, ""),
      file,
      dataURL: e.target.result,
      hotSpots: [],
    };
    viewer.addScene(id, {
      type: "equirectangular",
      panorama: e.target.result,
      hotSpots: [],
    });
    if (!currentScene) {
      viewer.loadScene(id);
      currentScene = id;
    }
    atualizarListaCenas();
  };
  reader.readAsDataURL(file);
}

function rebuildViewerFromScenes() {
  const configScenes = {};
  for (const id in scenes) {
    configScenes[id] = {
      type: "equirectangular",
      panorama: scenes[id].dataURL,
      hotSpots: scenes[id].hotSpots.map((h) => ({
        ...h,
        text: decodeURIComponent(h.text),
      })),
    };
  }

  setupViewer(configScenes);

  // 🔥 ISSO É O QUE ESTAVA FALTANDO
  if (currentScene && scenes[currentScene]) {
    viewer.loadScene(currentScene);
  }
}

window.removerHotspot = function (hotSpotId) {
  if (!confirm(`Remover hotspot?`)) return;
  scenes[currentScene].hotSpots = scenes[currentScene].hotSpots.filter(
    (h) => h.id !== hotSpotId
  );
  try {
    viewer.removeHotSpot(hotSpotId, currentScene);
  } catch (e) {}
  atualizarListaHotspots();
};

window.editarHotspot = function (hotSpotId) {
  const h = scenes[currentScene].hotSpots.find((h) => h.id === hotSpotId);
  if (!h) return;

  const novoDestino = prompt("Novo ID da cena de destino:", h.sceneId);
  if (!novoDestino || !scenes[novoDestino]) {
    showAlert("Cena de destino inválida.");
    return;
  }

  let novoYaw = prompt(
    "Yaw ao chegar na cena (ex: 0, 90, -45):",
    h.targetYaw ?? 0
  );
  novoYaw = parseFloat(novoYaw);
  if (isNaN(novoYaw)) novoYaw = 0;

  h.sceneId = novoDestino;
  h.targetYaw = novoYaw;
  h.text = encodeURIComponent(
    `Ir para ${scenes[novoDestino].nome || novoDestino}`
  );

  rebuildViewerFromScenes();
  atualizarListaHotspots();
};

function atualizarListaHotspots() {
  let container = document.getElementById("hotspotListContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "hotspotListContainer";
    document.body.insertBefore(container, document.getElementById("viewer"));
  }
  container.innerHTML = `<h4>Hotspots em "${currentScene}":</h4>`;
  const ul = document.createElement("ul");
  (scenes[currentScene]?.hotSpots || []).forEach((h) => {
    const li = document.createElement("li");
    li.innerHTML = `→ ${h.sceneId} <button onclick="editarHotspot('${h.id}')">Editar</button> <button onclick="removerHotspot('${h.id}')">X</button>`;
    ul.appendChild(li);
  });
  container.appendChild(ul);
}

function atualizarListaCenas() {
  let container = document.getElementById("sceneSelectContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "sceneSelectContainer";
    document.body.insertBefore(container, document.getElementById("viewer"));
  }
  container.innerHTML = `<label>Trocar cena: </label>`;
  const select = document.createElement("select");
  Object.keys(scenes).forEach((id) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = scenes[id].nome || id;
    if (id === currentScene) opt.selected = true;
    select.appendChild(opt);
  });
  select.onchange = (e) => viewer.loadScene(e.target.value);
  container.appendChild(select);
}

function removerCena(id) {
  if (!id || !scenes[id]) {
    showAlert("Cena inválida.");
    return;
  }

  if (!confirm(`Remover cena '${scenes[id].nome || id}'?`)) return;

  // 1. Remove a cena
  delete scenes[id];

  // 2. Remove hotspots de outras cenas que apontavam para ela
  for (const sceneId in scenes) {
    scenes[sceneId].hotSpots = scenes[sceneId].hotSpots.filter(
      (h) => h.sceneId !== id
    );
  }

  // 3. Se não sobrou nenhuma cena
  if (Object.keys(scenes).length === 0) {
    currentScene = null;
    setupViewer({});
    atualizarListaCenas();
    atualizarListaHotspots();
    showAlert("Cena removida. Nenhuma cena restante.");
    return;
  }

  // 4. Define nova cena ativa (primeira disponível)
  currentScene = Object.keys(scenes)[0];

  // 5. Reconstrói o viewer corretamente
  rebuildViewerFromScenes();

  try {
    viewer.loadScene(currentScene);
  } catch (e) {
    console.warn("Erro ao carregar nova cena:", e);
  }

  atualizarListaCenas();
  atualizarListaHotspots();
  showAlert("Cena removida com sucesso!");
}
