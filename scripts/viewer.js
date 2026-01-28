// viewer.js
const supabaseClient = window.supabaseClient;

// =========================
// Utils
// =========================
function getPanoramaIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("tourId");
}

// =========================
// Renderização
// =========================
function renderizarPanorama(estruturaJson) {
  if (!estruturaJson || Object.keys(estruturaJson).length === 0) {
    alert("Panorama vazio ou inválido.");
    return;
  }

  const scenes = {};
  let firstScene = null;

  Object.keys(estruturaJson).forEach((id) => {
    const cena = estruturaJson[id];
    if (!cena?.panorama) {
      console.warn(`Cena ${id} não possui URL de imagem.`);
      return;
    }

    if (!firstScene) firstScene = id;

    scenes[id] = {
      type: "equirectangular",
      panorama: cena.panorama, // 🔥 USANDO A URL DO STORAGE
      hotSpots: (cena.hotSpots || []).map((h) => ({
        id: h.id,
        pitch: h.pitch,
        yaw: h.yaw,
        type: "scene",
        sceneId: h.sceneId,
        targetYaw: h.targetYaw ?? 0,
        text: decodeURIComponent(h.text || ""),
      })),
    };
  });

  const viewer = pannellum.viewer("viewer", {
    default: {
      firstScene,
      autoLoad: true,
      loadingNotice: "Carregando...",
    },
    scenes,
  });

  setTimeout(() => {
    pre_carregarImagens(scenes, firstScene);
  }, 1000);

  // ===== MENU DE CENAS =====
  const menu = document.getElementById("sceneMenu");
  const select = document.getElementById("sceneSelect");
  const loading = document.getElementById("loading");

  viewer.on("scenechange", (sceneId) => {
    if (select) select.value = sceneId; // Muda o texto do menu lateral
    
  });

  if (menu && select) {
    Object.keys(scenes).forEach((id) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = id;
      select.appendChild(opt);
    });

    select.value = firstScene;
    select.onchange = () => viewer.loadScene(select.value);
    menu.style.display = "block";
  }
}

// =========================
// Carregar imagens antecipadamente
// =========================
function pre_carregarImagens(scenes) {
  Object.keys(scenes).forEach((id) => {
    const img = new Image();
    img.src = scenes[id].panorama; // O navegador baixa e guarda no cache
  });
}

// =========================
// Carregar do Supabase
// =========================
async function carregarPanorama() {
  const panoramaId = getPanoramaIdFromUrl();

  if (!panoramaId) {
    alert("ID do panorama não informado.");
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("panoramas")
      .select("estrutura_json")
      .eq("id", panoramaId)
      .maybeSingle();

    if (error) {
      console.error("Erro Supabase:", error);
      throw new Error("Erro ao conectar com o servidor.");
    }
    if (!data) {
      // Se data for nulo, o ID realmente não existe no banco
      console.error("ID não encontrado:", panoramaId);
      alert("Ops! Este panorama não existe ou foi excluído.");
      return;
    }
    if (!data.estrutura_json) {
      throw new Error("Estrutura do tour está corrompida.");
    }

    renderizarPanorama(data.estrutura_json);
  } catch (err) {
    console.error(err);
    alert("Erro ao carregar panorama.");
  }
}

// =========================
// Init
// =========================
document.addEventListener("DOMContentLoaded", carregarPanorama);
