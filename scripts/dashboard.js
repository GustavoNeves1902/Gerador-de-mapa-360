// ===============================
// SUPABASE CLIENT
// ===============================
const supabaseClient = window.supabaseClient;

// ===============================
// ELEMENTOS DO DOM
// ===============================
const panoramaGrid = document.getElementById("panorama-list");
const userNameDisplay = document.getElementById("user-name");
const btnLogout = document.getElementById("btn-logout");
const loadingMessage = document.getElementById("loading-message");

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  const {
    data: { user },
    error,
  } = await supabaseClient.auth.getUser();

  if (error || !user) {
    window.location.href = "/pages/login.html";
    return;
  }

  await fetchUserProfile(user.id);
  await fetchPanoramas(user.id);
});

// ===============================
// PERFIL
// ===============================
async function fetchUserProfile(userId) {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("nome_imobiliaria")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("Erro ao buscar perfil:", error.message);
    return;
  }

  if (data) {
    userNameDisplay.textContent = data.nome_imobiliaria;
  }
}

// ===============================
// PANORAMAS
// ===============================
async function fetchPanoramas(userId) {
  loadingMessage.style.display = "block";
  panoramaGrid.style.display = "none";

  const { data, error } = await supabaseClient
    .from("panoramas")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  loadingMessage.style.display = "none";
  panoramaGrid.style.display = "grid";

  if (error) {
    console.error("Erro ao buscar panoramas:", error.message);
    panoramaGrid.innerHTML = "<p>Erro ao carregar panoramas.</p>";
    return;
  }

  renderPanoramas(data);
}

// ===============================
// RENDERIZAÇÃO
// ===============================
function renderPanoramas(list) {
  panoramaGrid.innerHTML = "";

  if (!list || list.length === 0) {
    panoramaGrid.innerHTML = `
      <p style="text-align:center; margin-top:40px;">
        📭 Você ainda não criou nenhum panorama.
      </p>
    `;
    return;
  }

  list.forEach((item) => {
    const card = document.createElement("div");
    card.className = "panorama-card";

    const dataCriacao = new Date(item.created_at).toLocaleDateString("pt-BR");

    card.innerHTML = `
      <div class="card-thumb"
           style="background-image:url('${item.thumb_url}');
                  height:150px;
                  background-size:cover;
                  border-radius:8px 8px 0 0;">
      </div>

      <div class="card-info" style="padding:15px;">
        <h3 style="margin:0;color:#0d5fb3">
          ${item.nome_projeto}
        </h3>

        <p style="font-size:12px;color:#666">
          Criado em: ${dataCriacao}
        </p>

        <div class="card-actions"
             style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
          
          <button class="btn-primary"
                  onclick="visualizarTour('${item.id}')">
            Visualizar
          </button>

          <button class="btn-secondary"
                onclick="copiarLinkTour('${item.id}')">
          Copiar Link
        </button>

          <button class="btn-danger"
                  onclick="deletarPanorama('${item.id}','${item.pasta_nome}')">
            Excluir
          </button>
        </div>
      </div>
    `;

    panoramaGrid.appendChild(card);
  });
}

window.copiarLinkTour = function (tourId) {
  if (!tourId) {
    showAlert("ID do tour inválido.");
    return;
  }

  const link = `${window.location.origin}/pages/viewer.html?tourId=${tourId}`;

  navigator.clipboard
    .writeText(link)
    .then(() => {
      alert("🔗 Link copiado com sucesso!");
    })
    .catch(() => {
      alert("Erro ao copiar o link.");
    });
};

// ===============================
// DOWNLOAD ZIP
// ===============================
window.baixarProjetoCompleto = async function (estruturaJson, nomeProjeto) {
  try {
    const zip = new JSZip();
    const nomeFormatado = nomeProjeto.replace(/\s+/g, "_").toLowerCase();

    const scenes = {};
    const sceneIds = Object.keys(estruturaJson);

    sceneIds.forEach((id) => {
      const cena = estruturaJson[id];

      scenes[id] = {
        type: "equirectangular",
        panorama: cena.dataURL, // 🔥 BASE64 DIRETO
        hotSpots: (cena.hotSpots || []).map((h) => ({
          ...h,
          text: decodeURIComponent(h.text || ""),
        })),
      };
    });

    const firstScene = sceneIds[0];

    const htmlContent = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${nomeProjeto}</title>

<link rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css"/>
<script src="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js"></script>

<style>
html,body{
  margin:0;
  width:100%;
  height:100%;
  background:#000;
}
#viewer{
  width:100%;
  height:100vh;
}
#menu{
  position:fixed;
  top:10px;
  left:10px;
  z-index:9999;
  background:rgba(0,0,0,.6);
  padding:6px;
  border-radius:6px;
}
#menu label{
  color:white;
  font-weight:bold;
}
</style>
</head>

<body>

<div id="menu">
  <label>Ir para:</label>
  <select id="jump"></select>
</div>

<div id="viewer"></div>

<script>
const scenes = ${JSON.stringify(scenes)};

const viewer = pannellum.viewer("viewer", {
  default: {
    firstScene: "${firstScene}",
    autoLoad: true
  },
  scenes
});

const select = document.getElementById("jump");
Object.keys(scenes).forEach(id=>{
  const opt = document.createElement("option");
  opt.value = id;
  opt.textContent = id;
  select.appendChild(opt);
});
select.value = "${firstScene}";
select.onchange = () => viewer.loadScene(select.value);
</script>

</body>
</html>
`;

    zip.file("index.html", htmlContent);

    const blob = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${nomeFormatado}_panorama.zip`;
    link.click();
  } catch (err) {
    console.error(err);
    alert("Erro ao gerar o download.");
  }
};

// ===============================
// DELETAR PANORAMA
// ===============================
window.deletarPanorama = async function (id, pastaNome) {
  if (!confirm("Deseja excluir este panorama?")) return;

  const {
    data: { user },
  } = await supabaseClient.auth.getUser();

  await supabaseClient.from("panoramas").delete().eq("id", id);

  await supabaseClient.storage
    .from("panoramas")
    .remove([`${user.id}/${pastaNome}/index.html`]);

  alert("Panorama excluído com sucesso!");
  location.reload();
};

// ===============================
// LOGOUT
// ===============================
btnLogout.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  window.location.href = "/pages/login.html";
});

// ===============================
// VISUALIZAR TOUR
// ===============================
window.visualizarTour = function (tourId) {
  window.open(`/pages/viewer.html?tourId=${tourId}`, "_blank");
};
