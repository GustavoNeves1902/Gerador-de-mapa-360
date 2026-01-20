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
