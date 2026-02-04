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
function renderizarPanorama(estruturaJson, idInicial) {
  if (!estruturaJson || Object.keys(estruturaJson).length === 0) {
    alert("Panorama vazio ou inválido.");
    return;
  }

  const scenes = {};
  let fallbackFirstScene = null; // 🔥 Definimos um reserva caso o idInicial falhe

  Object.keys(estruturaJson).forEach((id) => {
    const cena = estruturaJson[id];
    if (!cena?.panorama) {
      console.warn(`Cena ${id} não possui URL de imagem.`);
      return;
    }

    // A primeira cena que encontrarmos vira nosso fallback
    if (!fallbackFirstScene) fallbackFirstScene = id;

    scenes[id] = {
      type: "equirectangular",
      panorama: cena.panorama,
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

  // 🔥 Escolha Inteligente: Usa a definida pelo usuário ou a primeira disponível
  const firstScene = (idInicial && scenes[idInicial]) ? idInicial : fallbackFirstScene;

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

  viewer.on("scenechange", (sceneId) => {
    if (select) select.value = sceneId;
  });

  if (menu && select) {
    select.innerHTML = "";
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
function pre_carregarImagens(scenes, idAtual) {
  Object.keys(scenes).forEach((id) => {
    if (id !== idAtual) { // 🔥 Não recarrega a cena que já está aberta
        const img = new Image();
        img.src = scenes[id].panorama;
    }
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
      .select("estrutura_json, id_cena_inicial")
      .eq("id", panoramaId)
      .maybeSingle();

    if (error) {
      console.error("Erro Supabase:", error);
      throw new Error("Erro ao conectar com o servidor.");
    }
    if (!data) {
      alert("Ops! Este panorama não existe ou foi excluído.");
      return;
    }

    renderizarPanorama(data.estrutura_json, data.id_cena_inicial);
  } catch (err) {
    console.error(err);
    alert("Erro ao carregar panorama.");
  }
}

document.addEventListener("DOMContentLoaded", carregarPanorama);