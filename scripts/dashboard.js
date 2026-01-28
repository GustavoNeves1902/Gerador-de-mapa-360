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

console.log("Verificando!");

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
    .select("id, created_at, thumb_url, nome_projeto, pasta_nome, pago")
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

    // Configurações de Status
    const statusTexto = item.pago ? "Pago ✅" : "Aguardando Pagamento ⏳";
    const statusCor = item.pago ? "#28a745" : "#dc3545";

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

        <p style="font-size:12px;color:#666; margin-bottom: 5px;">
          Criado em: ${dataCriacao}
        </p>

        <p style="font-size:13px; font-weight:bold; color:${statusCor}; margin: 5px 0 12px 0;">
          Status: ${statusTexto}
        </p>

        <div class="card-actions" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
          
    <button class="btn-primary" onclick="visualizarTour('${item.id}')">
        Visualizar
    </button>

    <button class="btn-secondary"
        style="${!item.pago ? "opacity: 0.5; cursor: not-allowed; filter: grayscale(1);" : ""}"
        onclick="${
          item.pago
            ? `showModal('Sucesso!', 'Este item já foi pago e o link está disponível.', '✅', true); copiarLinkTour('${item.id}')`
            : `showModal('Acesso Bloqueado', 'Você ainda não possui acesso a este panorama. Realize o pagamento para liberar o link.', '🔒', false)`
        }">
        Copiar Link
    </button>

    ${
      !item.pago
        ? `
        <button class="btn-secondary" style="background-color: green; color: white;" 
            onclick="showModal('Acesso Bloqueado', 'Realize o pagamento para liberar o link deste panorama.', '🔒', false)">
            Pagar
        </button>
    `
        : ""
    }

    <button class="btn-danger" style="background-color: red;"
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
    .then(() => {})
    .catch(() => {});
};

// ===============================
// DELETAR PANORAMA
// ===============================
window.deletarPanorama = async function (id, pastaNome) {
  if (!confirm("Deseja excluir este panorama permanentemente?")) return;

  const {
    data: { user },
  } = await supabaseClient.auth.getUser();

  // 1. Deleta do Banco de Dados
  const { error: dbError } = await supabaseClient
    .from("panoramas")
    .delete()
    .eq("id", id);

  if (dbError) {
    alert("Erro ao excluir registro do banco.");
    return;
  }

  // 2. Tenta listar e remover todos os arquivos da pasta no Storage
  // (O Supabase exige o caminho completo dos arquivos para deletar)
  const { data: files } = await supabaseClient.storage
    .from("panoramas")
    .list(`${user.id}/${pastaNome}`);

  if (files && files.length > 0) {
    const filesToRemove = files.map((f) => `${user.id}/${pastaNome}/${f.name}`);
    await supabaseClient.storage.from("panoramas").remove(filesToRemove);
  }

  alert("Panorama e arquivos excluídos com sucesso!");
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

window.showModal = function (titulo, mensagem, icone, isPago) {
  const modal = document.getElementById("custom-modal");
  const footer = document.getElementById("modal-footer");

  document.getElementById("modal-title").innerText = titulo;
  document.getElementById("modal-message").innerText = mensagem;
  document.getElementById("modal-icon").innerText = icone;

  // Limpa os botões anteriores
  footer.innerHTML = "";

  if (!isPago) {
    // Se NÃO estiver pago, adiciona o botão de Pagar
    const btnPagar = document.createElement("button");
    btnPagar.className = "btn-primary"; // Use sua classe de CSS de destaque
    btnPagar.innerText = "Pagar Agora 💳";
    btnPagar.onclick = () => {
      alert("Redirecionando para o checkout..."); // Aqui você colocará o link de pagamento no futuro
    };
    footer.appendChild(btnPagar);
  }

  // Botão de fechar (sempre presente)
  const btnFechar = document.createElement("button");
  btnFechar.className = "btn-secondary";
  btnFechar.style.width = "100%";
  btnFechar.innerText = "Fechar";
  btnFechar.onclick = closeModal;
  footer.appendChild(btnFechar);

  modal.style.display = "flex";
};

window.closeModal = function () {
  document.getElementById("custom-modal").style.display = "none";
};
