const supabaseClient = window.supabaseClient;

let viewer;
let scenes = {};
let currentScene = null;
let addingHotspot = false;
let hotspotEmEdicao = null;

let tempHotspotCoords = null;
let movendoHotspot = false;

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

// No clique do botão Reposicionar
document.getElementById("btnReposicionar").onclick = () => {
  document.getElementById("modalHotspot").style.display = "none"; // Fecha o modal temporariamente
  movendoHotspot = true;
  showAlert("Clique no novo local do panorama para mover o hotspot.");
};

// ---------- Criação / (Re)configuração do viewer ----------
let mouseDownPos = { x: 0, y: 0 };

function setupViewer(initialScenes = {}) {
  try {
    if (viewer && typeof viewer.destroy === "function") viewer.destroy();
  } catch (e) {}

  viewer = pannellum.viewer("viewer", {

    "autoLoad": true,
    "notSupportedMessage": "Seu navegador não tem suporte para WebGL.",

    "strings": {
      "noPanoramaError": "Nenhuma imagem panorâmica foi especificada",
      "fileAcessError": "O arquivo não pôde ser acessado",
      "loadingLabel": "Carregando..."
    },
    default: { firstScene: null, autoLoad: true },
    scenes: initialScenes,
  });

  viewer.on("mousedown", (event) => {
    mouseDownPos = { x: event.clientX, y: event.clientY };
  });

  viewer.on("mouseup", (event) => {
    // 1. Verifica se estamos em algum modo de interação (Adicionar ou Mover)
    // Se não estivermos em nenhum dos dois, ignora o clique
    if (!addingHotspot && !movendoHotspot) return;
    if (!currentScene) return;

    const moveX = Math.abs(event.clientX - mouseDownPos.x);
    const moveY = Math.abs(event.clientY - mouseDownPos.y);
    if (moveX > 5 || moveY > 5) return;

    const coords = viewer.mouseEventToCoords(event);

    // 2. SITUAÇÃO A: Reposicionando um hotspot existente
    if (movendoHotspot && hotspotEmEdicao) {
      const h = scenes[currentScene].hotSpots.find(
        (h) => h.id === hotspotEmEdicao,
      );
      if (h) {
        h.pitch = coords[0];
        h.yaw = coords[1];

        movendoHotspot = false;
        rebuildViewerFromScenes();
        abrirModalHotspot(true, h); // Reabre o modal para salvar as mudanças
      }
      return;
    }

    // 3. SITUAÇÃO B: Adicionando um hotspot novo
    if (addingHotspot) {
      tempHotspotCoords = { pitch: coords[0], yaw: coords[1] };
      abrirModalHotspot();
    }
  });

  viewer.on("scenechange", (sceneId) => {
    currentScene = sceneId;
    atualizarListaHotspots();
    atualizarListaCenas();
  });
}

function abrirModalHotspot(isEdicao = false, hotspotData = null) {
  const modal = document.getElementById("modalHotspot");
  const select = document.getElementById("selectDestino");
  const inputYaw = document.getElementById("inputTargetYaw");

  select.innerHTML = "";
  Object.keys(scenes).forEach((id) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = scenes[id].nome || id;
    select.appendChild(opt);
  });

  if (isEdicao && hotspotData) {
    select.value = hotspotData.sceneId;
    inputYaw.value = hotspotData.targetYaw || 0;
    hotspotEmEdicao = hotspotData.id;
  } else {
    inputYaw.value = "0";
    hotspotEmEdicao = null;
  }

  modal.style.display = "flex";
}

// Configuração dos cliques dos botões (coloque isso dentro do seu bindUI ou no escopo global)
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btnCancelarHotspot").onclick = () => {
    document.getElementById("modalHotspot").style.display = "none";
    addingHotspot = false;
  };

  document.getElementById("btnSalvarHotspot").onclick = () => {
    const destino = document.getElementById("selectDestino").value;
    const targetYaw =
      parseFloat(document.getElementById("inputTargetYaw").value) || 0;

    if (!destino) return showAlert("Selecione um destino.");

    if (hotspotEmEdicao) {
      // Edição
      const h = scenes[currentScene].hotSpots.find(
        (h) => h.id === hotspotEmEdicao,
      );
      if (h) {
        h.sceneId = destino;
        h.targetYaw = targetYaw;
        h.text = encodeURIComponent(`Ir para ${destino}`);
      }
      rebuildViewerFromScenes();
    } else {
      // Novo
      const hotspotId = "hspot_" + Date.now();
      const hotspot = {
        id: hotspotId,
        pitch: tempHotspotCoords.pitch,
        yaw: tempHotspotCoords.yaw,
        type: "scene",
        text: encodeURIComponent(`Ir para ${destino}`),
        sceneId: destino,
        targetYaw: targetYaw,
      };
      scenes[currentScene].hotSpots.push(hotspot);
      viewer.addHotSpot(
        { ...hotspot, text: decodeURIComponent(hotspot.text) },
        currentScene,
      );
    }

    document.getElementById("modalHotspot").style.display = "none";
    addingHotspot = false;
    atualizarListaHotspots();
  };
});

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

  const params = new URLSearchParams(window.location.search);
  const editId = params.get("editId");

  if (editId) {
    // Se existir um ID na URL, buscamos os dados para preencher a tela
    carregarDadosParaEdicao(editId);
  }
});

async function carregarDadosParaEdicao(id) {
  showLoading("Carregando dados do tour...");
  try {
    const { data, error } = await supabaseClient
      .from("panoramas")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    // 1. Preenche o nome do projeto no input
    document.getElementById("nome").value = data.nome_projeto;

    // 2. Alimenta a variável global 'scenes'
    const estrutura = data.estrutura_json;
    for (const cenaId in estrutura) {
      scenes[cenaId] = {
        type: "equirectangular",
        nome: cenaId,
        dataURL: estrutura[cenaId].panorama, // Aqui é a URL do Storage
        hotSpots: estrutura[cenaId].hotSpots || [],
        isOld: true, // Marcador para saber que já está no Storage
      };
    }

    atualizarListaCenas();

    const selectInicial = document.getElementById("idCenaInicial");
    if (selectInicial && data.id_cena_inicial) {
      selectInicial.value = data.id_cena_inicial;
    }

    // 3. Atualiza a interface
    currentScene = Object.keys(scenes)[0];
    rebuildViewerFromScenes();
    atualizarListaCenas();
    atualizarListaHotspots();

    // 4. Muda o botão para "Atualizar"
    const btnSalvar = document.getElementById("salvarPlataforma");
    btnSalvar.textContent = "Atualizar Tour";
    // Removemos o listener antigo e colocamos o de atualização
    btnSalvar.replaceWith(btnSalvar.cloneNode(true));
    document.getElementById("salvarPlataforma").onclick = () =>
      atualizarNoSupabase(id, data.pasta_nome);

    hideLoading();
  } catch (err) {
    console.error(err);
    showAlert("Erro ao carregar edição: " + err.message);
  }
}

async function atualizarNoSupabase(editId, pastaNome) {
  showLoading("Atualizando tour...");
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  const estruturaFinal = {};

  const cenaInicialSelecionada = document.getElementById("idCenaInicial").value;
  const finalFirstSceneId =
    cenaInicialSelecionada || Object.keys(estruturaFinal)[0];

  try {
    for (const id in scenes) {
      const s = scenes[id];

      // Se a imagem começa com "http", ela já está no Storage
      if (s.dataURL.startsWith("http")) {
        estruturaFinal[id] = {
          type: s.type,
          nome: s.nome,
          panorama: s.dataURL,
          hotSpots: s.hotSpots,
        };
      } else {
        // Se não é URL, é imagem nova (Base64). Fazemos o processo de otimização e upload
        const blob = await otimizarImagem(s.dataURL, 4096, 0.8);
        const filePath = `${user.id}/${pastaNome}/scenes/${id}_panorama.jpg`;

        await supabaseClient.storage
          .from("panoramas")
          .upload(filePath, blob, { upsert: true });
        const { data: urlData } = supabaseClient.storage
          .from("panoramas")
          .getPublicUrl(filePath);

        estruturaFinal[id] = {
          type: s.type,
          nome: s.nome,
          panorama: urlData.publicUrl,
          hotSpots: s.hotSpots,
        };
      }
    }

    // Atualiza o Banco de Dados
    const { error } = await supabaseClient
      .from("panoramas")
      .update({
        nome_projeto: document.getElementById("nome").value,
        estrutura_json: estruturaFinal,
        id_cena_inicial: finalFirstSceneId,
        thumb_url: estruturaFinal[Object.keys(estruturaFinal)[0]].panorama,
      })
      .eq("id", editId);

    if (error) throw error;

    hideLoading();
    showAlert("✅ Tour atualizado com sucesso!");
    setTimeout(() => (window.location.href = "dashboard.html"), 1500);
  } catch (err) {
    console.error(err);
    hideLoading();
    showAlert("Erro ao atualizar: " + err.message);
  }
}

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
        }),
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
    if (!user) throw new Error("Usuário não autenticado.");

    showLoading(
      "Otimizando e enviando imagens... (Isso pode levar alguns segundos)",
    );

    const nomeProjeto = document.getElementById("nome").value || "Tour 360";
    const folderName = `tour_${Date.now()}`;
    const bucket = "panoramas";

    const estruturaParaBanco = {};

    const cenaInicialSelecionada =
      document.getElementById("idCenaInicial").value;
    const firstSceneId =
      cenaInicialSelecionada || Object.keys(estruturaParaBanco)[0];

    // 1. Loop para Processar, Comprimir e Subir cada cena
    for (const id in scenes) {
      const s = scenes[id];

      // Otimiza a imagem (4K e 80% qualidade) para carregar rápido no visualizador
      const blobOtimizado = await otimizarImagem(s.dataURL, 4096, 0.8);

      const fileName = `${id}_panorama.jpg`;
      const filePath = `${user.id}/${folderName}/scenes/${fileName}`;

      // Upload para o Storage
      const { error: uploadError } = await supabaseClient.storage
        .from(bucket)
        .upload(filePath, blobOtimizado, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (uploadError)
        throw new Error(`Erro no upload da cena ${id}: ${uploadError.message}`);

      // Obtém a URL pública
      const { data: urlData } = supabaseClient.storage
        .from(bucket)
        .getPublicUrl(filePath);

      // Monta o objeto da cena com a URL (muito mais leve que Base64)
      estruturaParaBanco[id] = {
        type: s.type,
        nome: s.nome,
        panorama: urlData.publicUrl,
        hotSpots: s.hotSpots || [],
      };
    }

    // 2. Criar e subir o arquivo index.html estático para o Storage
    const htmlFinal = gerarHTMLComUrls(estruturaParaBanco, firstSceneId);
    const htmlPath = `${user.id}/${folderName}/index.html`;
    const htmlBlob = new Blob([htmlFinal], { type: "text/html" });

    await supabaseClient.storage.from(bucket).upload(htmlPath, htmlBlob, {
      contentType: "text/html",
      upsert: true,
    });

    const { data: indexUrlData } = supabaseClient.storage
      .from(bucket)
      .getPublicUrl(htmlPath);

    // 3. Salvar o registro final na tabela do Banco de Dados
    // payload agora é minúsculo pois não contém imagens em texto
    const { error: dbError } = await supabaseClient.from("panoramas").insert([
      {
        user_id: user.id,
        nome_projeto: nomeProjeto,
        pasta_nome: folderName,
        url_index: indexUrlData.publicUrl,
        // Usamos a URL da primeira cena como thumbnail
        thumb_url:
          estruturaParaBanco[Object.keys(estruturaParaBanco)[0]].panorama,
        id_cena_inicial: firstSceneId,
        estrutura_json: estruturaParaBanco,
        pago: false, // Começa como não pago por padrão
      },
    ]);

    if (dbError) throw dbError;

    hideLoading();
    showAlert("✅ Tour publicado e otimizado com sucesso!");

    // Pequeno delay para o usuário ler o alerta antes de redirecionar
    setTimeout(() => (window.location.href = "dashboard.html"), 1500);
  } catch (err) {
    console.error("Erro completo:", err);
    hideLoading();
    showAlert("Erro ao salvar: " + err.message);
  }
}

// Função auxiliar para o arquivo HTML que vai para o Storage
function gerarHTMLComUrls(scenesData, firstSceneId) {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Tour 360</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css"/>
  <script src="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js"></script>
  <style>body { margin:0; } #viewer { width:100%; height:100vh; }</style>
</head>
<body>
  <div id="viewer"></div>
  <script>
    pannellum.viewer('viewer', {
      default: { firstScene: '${firstSceneId}', autoLoad: true },
      scenes: ${JSON.stringify(scenesData)}
    });
  </script>
</body>
</html>`;
}

// Função auxiliar para gerar o HTML usando URLs de imagem
function gerarHTMLComUrls(scenesData, firstSceneId) {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css" />
<script src="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js"></script>
<style>body { margin:0; } #viewer { width:100%; height:100vh }</style>
</head>
<body>
<div id="viewer"></div>
<script>
  const viewer = pannellum.viewer("viewer", {
    default: { firstScene: "${firstSceneId}", autoLoad: true },
    scenes: ${JSON.stringify(scenesData)}
  });
</script>
</body>
</html>`;
}

// ---------- Lógica de Cenas e Hotspots (Sua Lógica Original) ----------
function onAddScene() {
  const fileInput = document.getElementById("fileInput");
  const id = document.getElementById("imageId").value.trim();
  if (!fileInput.files[0] || !id) return showAlert("Selecione imagem e ID.");

  if (scenes[id]) {
    return showAlert(
      `O ID "${id}" já está em uso. Escolha um nome diferente para esta cena.`,
    );
  }

  const file = fileInput.files[0];
  const reader = new FileReader();
  reader.onload = (e) => {
    scenes[id] = {
      type: "equirectangular",
      nome: id,
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
    showAlert(`Cena "${id}" adicionada com sucesso!`);
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

  if (currentScene && scenes[currentScene]) {
    viewer.loadScene(currentScene);
  }
}

window.removerHotspot = function (hotSpotId) {
  if (!confirm(`Remover hotspot?`)) return;
  scenes[currentScene].hotSpots = scenes[currentScene].hotSpots.filter(
    (h) => h.id !== hotSpotId,
  );
  try {
    viewer.removeHotSpot(hotSpotId, currentScene);
  } catch (e) {}
  atualizarListaHotspots();
};

window.editarHotspot = function (hotSpotId) {
  // Busca os dados do hotspot atual dentro da cena ativa
  const h = scenes[currentScene].hotSpots.find((h) => h.id === hotSpotId);
  if (!h) return;

  // Em vez de prompts, chamamos a função que abre o Modal
  // Passamos 'true' para indicar que é edição e os dados 'h'
  abrirModalHotspot(true, h);
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
    opt.textContent = id;
    if (id === currentScene) opt.selected = true;
    select.appendChild(opt);
  });
  select.onchange = (e) => viewer.loadScene(e.target.value);
  container.appendChild(select);

  const selectInicial = document.getElementById("idCenaInicial");
  if (selectInicial) {
    const valorAtual = selectInicial.value;
    selectInicial.innerHTML =
      '<option value="">Selecione a cena de início</option>';

    Object.keys(scenes).forEach((id) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = id;
      if (id === valorAtual) opt.selected = true;
      selectInicial.appendChild(opt);
    });
  }
}

async function otimizarImagem(dataURL, larguraAlvo = 4096, qualidade = 0.75) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      // Mantém a proporção (geralmente 2:1 para 360º)
      const escala = larguraAlvo / img.width;
      canvas.width = larguraAlvo;
      canvas.height = img.height * escala;

      // Desenha a imagem redimensionada no canvas
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Transforma em Blob com compressão JPEG
      canvas.toBlob(
        (blob) => {
          resolve(blob);
        },
        "image/jpeg",
        qualidade,
      );
    };
    img.src = dataURL;
  });
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
      (h) => h.sceneId !== id,
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
