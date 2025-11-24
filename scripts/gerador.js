let viewer;
let scenes = {};
let currentScene = null;
let addingHotspot = false;

// Função para substituir o alert()
window.showAlert = function (mensagem) {
  const modal = document.getElementById("customAlert");
  const msg = document.getElementById("customAlertMsg");
  const btn = document.getElementById("customAlertBtn");

  // Define a mensagem
  msg.textContent = mensagem;

  // Mostra o modal
  modal.style.display = "block";

  // Quando clicar no botão, fecha o modal
  btn.onclick = function () {
    modal.style.display = "none";
  };

  // Fecha se clicar fora (opcional)
  window.onclick = function (event) {
    if (event.target == modal) {
      modal.style.display = "none";
    }
  };
};

// Inicializa o viewer
window.addEventListener("DOMContentLoaded", () => {
  if (typeof JSZip === "undefined" || typeof pannellum === "undefined") {
    showAlert(
      "JSZip e/ou Pannellum não carregaram! Verifique a conexão ou os scripts."
    );
    return;
  }

  // Verifica se a biblioteca QR Code carregou
  if (typeof QRCode === "undefined") {
    console.warn(
      "A biblioteca qrcode.min.js não foi carregada. O QR Code não funcionará."
    );
  }

  viewer = pannellum.viewer("viewer", {
    default: { firstScene: null, autoLoad: true },
    scenes: {},
  });

  // Atualiza a cena atual E a lista de hotspots
  viewer.on("scenechange", (sceneId) => {
    currentScene = sceneId;
    atualizarListaHotspots();
  });

  // ----------------------------------------------------------------------
  // FUNÇÃO DE REMOVER CENA (Sua versão robusta)
  // ----------------------------------------------------------------------
  window.removerCena = function (sceneIdToRemove) {
    if (!sceneIdToRemove || !scenes[sceneIdToRemove]) {
      showAlert("Nenhuma cena selecionada ou cena não existe.");
      return;
    }

    if (
      !confirm(
        `Tem certeza que deseja remover a cena '${
          scenes[sceneIdToRemove].nome || sceneIdToRemove
        }' (ID: ${sceneIdToRemove})? Esta ação é irreversível.`
      )
    ) {
      return;
    }

    const nomeRemovido = scenes[sceneIdToRemove].nome || sceneIdToRemove;
    const cenasParaRecarregar = [];

    delete scenes[sceneIdToRemove];

    try {
      viewer.removeScene(sceneIdToRemove);
    } catch (e) {
      console.warn(e);
    }

    let hotspotsRemovidos = 0;
    for (const id in scenes) {
      if (scenes.hasOwnProperty(id)) {
        const cenaAtual = scenes[id];
        const hotspotsOriginais = cenaAtual.hotSpots.length;

        cenaAtual.hotSpots = cenaAtual.hotSpots.filter((hotspot) => {
          if (hotspot.type === "scene" && hotspot.sceneId === sceneIdToRemove) {
            hotspotsRemovidos++;
            return false;
          }
          return true;
        });

        if (cenaAtual.hotSpots.length !== hotspotsOriginais) {
          cenasParaRecarregar.push(id);
        }
      }
    }

    for (const id of cenasParaRecarregar) {
      const cena = scenes[id];
      const url = URL.createObjectURL(cena.file);
      viewer.addScene(
        id,
        { type: cena.type, panorama: url, hotSpots: cena.hotSpots },
        true
      );
    }

    let novoCurrentScene = Object.keys(scenes)[0] || null;
    currentScene = novoCurrentScene;

    if (novoCurrentScene) {
      viewer.loadScene(novoCurrentScene);
    } else {
      viewer = pannellum.viewer("viewer", {
        default: { firstScene: null, autoLoad: true },
        scenes: {},
      });
      viewer.on("scenechange", (sceneId) => (currentScene = sceneId));
    }

    showAlert(`Cena '${nomeRemovido}' removida com sucesso.`);
    atualizarListaCenas();
    atualizarListaHotspots();
  };

  // ----------------------------------------------------------------------
  // ADICIONAR CENA
  // ----------------------------------------------------------------------
  document.getElementById("addScene").addEventListener("click", () => {
    const fileInput = document.getElementById("fileInput");
    const id = document.getElementById("imageId").value.trim();
    if (!fileInput.files[0] || !id) {
      showAlert("Selecione uma imagem e insira um ID.");
      return;
    }

    if (scenes[id]) {
      showAlert(`ID '${id}' já existe. Escolha outro.`);
      return;
    }

    const file = fileInput.files[0];
    const url = URL.createObjectURL(file);
    const nomeImagem = file.name.replace(/\.[^/.]+$/, "");

    scenes[id] = {
      type: "equirectangular",
      nome: nomeImagem,
      file: file,
      dataURL: null, // Garante que começa nulo para conversão posterior
      hotSpots: [],
    };

    viewer.addScene(id, {
      type: "equirectangular",
      panorama: url,
      hotSpots: [],
    });

    if (!currentScene) {
      viewer.loadScene(id);
      currentScene = id;
    }
    showAlert(`Cena '${nomeImagem}' adicionada como ID '${id}'!`);
    atualizarListaCenas();
  });

  // ----------------------------------------------------------------------
  // EVENTOS DE HOTSPOT
  // ----------------------------------------------------------------------
  document.getElementById("addHotspot").addEventListener("click", () => {
    if (!currentScene) {
      showAlert("Carregue uma cena primeiro.");
      return;
    }
    addingHotspot = true;
    showAlert(
      "Modo de hotspot ativado. Clique no panorama para definir a posição."
    );
  });

  document.getElementById("removeScene").addEventListener("click", () => {
    if (!currentScene) return showAlert("Nenhuma cena ativa para remover.");
    window.removerCena(currentScene);
  });

  viewer.on("mousedown", (event) => {
    if (!addingHotspot) return;

    if (!currentScene) {
      setTimeout(() => {
        showAlert("Nenhuma cena ativa.");
        addingHotspot = false;
      }, 0);
      return;
    }

    const coords = viewer.mouseEventToCoords(event);
    const pitch = coords[0],
      yaw = coords[1];

    const destino = prompt("Digite o ID da cena de destino:");

    if (destino && scenes[destino]) {
      const nomeDestino = scenes[destino].nome || destino;

      let targetYaw = prompt(
        `Hotspot para '${nomeDestino}' (ID: ${destino}).\nDigite o ângulo de rotação (Yaw) ao chegar (ex: 0, 90, -45).`
      );
      targetYaw = parseFloat(targetYaw);
      if (isNaN(targetYaw)) {
        if (!confirm("Valor inválido. Usar 0?")) {
          setTimeout(() => {
            addingHotspot = false;
          }, 0);
          return;
        }
        targetYaw = 0;
      }

      const hotspotId = `hspot_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 9)}`;
      const hotspot = {
        id: hotspotId,
        pitch,
        yaw,
        type: "scene",
        text: encodeURIComponent(`Ir para ${nomeDestino}`),
        sceneId: destino,
        targetYaw: targetYaw,
      };

      scenes[currentScene].hotSpots.push(hotspot);
      viewer.addHotSpot(
        { ...hotspot, text: `Ir para ${nomeDestino}` },
        currentScene
      );

      setTimeout(() => {
        showAlert(`Hotspot adicionado!`);
        atualizarListaHotspots();
        addingHotspot = false;
      }, 0);
    } else {
      setTimeout(() => {
        showAlert(`Destino inválido!`);
        addingHotspot = false;
      }, 0);
    }
  });

  // Funções de Hotspot (Remover/Editar)
  window.removerHotspot = function (hotSpotId) {
    if (!currentScene) return showAlert("Nenhuma cena ativa.");
    const sceneId = currentScene;
    const hotspot = scenes[sceneId]?.hotSpots.find((h) => h.id === hotSpotId);
    if (!hotspot) return showAlert("Erro interno.");

    if (!confirm(`Remover hotspot?`)) return;

    try {
      viewer.removeHotSpot(hotSpotId, sceneId);
    } catch (e) {}
    if (scenes[sceneId]) {
      scenes[sceneId].hotSpots = scenes[sceneId].hotSpots.filter(
        (h) => h.id !== hotSpotId
      );
    }
    showAlert(`Hotspot removido!`);
    atualizarListaHotspots();
  };

  window.editarHotspot = function (hotSpotId) {
    if (!currentScene) return showAlert("Nenhuma cena ativa.");
    const sceneId = currentScene;
    const hotspotIndex = scenes[sceneId]?.hotSpots.findIndex(
      (h) => h.id === hotSpotId
    );
    if (hotspotIndex === -1) return showAlert("Hotspot não encontrado.");

    const hotspot = scenes[sceneId].hotSpots[hotspotIndex];
    const novoDestino = prompt(
      `Novo ID destino (Atual: ${hotspot.sceneId}):`,
      hotspot.sceneId
    );
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

    try {
      viewer.removeHotSpot(hotSpotId, sceneId);
    } catch (e) {}
    viewer.addHotSpot(
      { ...hotspot, text: `Ir para ${nomeDestinoNovo}` },
      sceneId
    );
    showAlert(`Hotspot editado!`);
    atualizarListaHotspots();
  };

  // ----------------------------------------------------------------------
  // FUNÇÕES UI
  // ----------------------------------------------------------------------
  function atualizarListaHotspots() {
    let listContainer = document.getElementById("hotspotListContainer");
    if (!listContainer) {
      listContainer = document.createElement("div");
      listContainer.id = "hotspotListContainer";
      document.body.insertBefore(
        listContainer,
        document.getElementById("viewer")
      );
    }
    listContainer.innerHTML = "";
    if (!currentScene || !scenes[currentScene]) return;

    const currentSceneData = scenes[currentScene];
    const title = document.createElement("h4");
    title.textContent = `Hotspots em "${
      currentSceneData.nome || currentScene
    }":`;
    listContainer.appendChild(title);

    if (currentSceneData.hotSpots.length === 0)
      listContainer.innerHTML += "<p>Nenhum hotspot.</p>";

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
      btnRemove.style.cssText =
        "margin-left:10px; background:#dc3545; color:white; border:none; cursor:pointer;";
      btnRemove.onclick = () => window.removerHotspot(hotspot.id);

      const btnEdit = document.createElement("button");
      btnEdit.textContent = "Editar";
      btnEdit.style.cssText =
        "margin-left:5px; background:#ffc107; color:black; border:none; cursor:pointer;";
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
    let existingSelectContainer = document.getElementById(
      "sceneSelectContainer"
    );
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
    else if (Object.keys(scenes).length > 0)
      select.value = Object.keys(scenes)[0];

    select.addEventListener("change", (e) => viewer.loadScene(e.target.value));
    if (Object.keys(scenes).length > 0)
      document.body.insertBefore(container, document.getElementById("viewer"));
  }

  function converterCenasParaDataURL() {
    const promises = [];
    for (const id in scenes) {
      const scene = scenes[id];
      // Só converte se tiver o arquivo e ainda não tiver convertido
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

      // Usa DataURL para garantir que funcione offline/mobile sem servidor
      const panoramaSource = s.dataURL;

      scenesData[id] = {
        type: s.type,
        panorama: panoramaSource,
        // Guarda o nome codificado para evitar quebra de JSON
        nome: encodeURIComponent(s.nome),
        hotSpots: s.hotSpots.map((h) => ({
          pitch: h.pitch,
          yaw: h.yaw,
          type: h.type,
          text: h.text, // Já está codificado
          sceneId: h.sceneId,
          targetYaw: h.targetYaw,
        })),
      };
    }

    const navigationMenuHTML = `
            <div id="scene-nav-menu" style="position:fixed; top:10px; left:10px; z-index:9999; background: rgba(0,0,0,0.6); padding: 5px; border-radius: 5px;">
                <label style="color:white; font-weight:bold; font-size: 14px;">Ir para:</label>
                <select id="jumpToScene" onchange="viewer.loadScene(this.value);">
                    ${Object.keys(scenesData)
                      .map((id) => {
                        // Decodifica o nome para o HTML visual
                        return `<option value="${id}" ${
                          id === firstSceneId ? "selected" : ""
                        }>${decodeURIComponent(scenesData[id].nome)}</option>`;
                      })
                      .join("")}
                </select>
            </div>
        `;

    const serializedScenes = JSON.stringify(scenesData);

    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>360</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css"/><script src="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js"></script><style>body{margin:0;overflow:hidden}#viewer{width:100%;height:100vh}#scene-nav-menu label,#scene-nav-menu select{vertical-align:middle}</style></head><body>${navigationMenuHTML}<div id="viewer"></div><script>let viewer;const scenes=${serializedScenes};Object.keys(scenes).forEach(id=>{scenes[id].title=decodeURIComponent(scenes[id].nome);scenes[id].hotSpots.forEach(h=>{h.text=decodeURIComponent(h.text)})});viewer=pannellum.viewer('viewer',{default:{firstScene:'${firstSceneId}',autoLoad:true},scenes:scenes});window.viewer=viewer;</script></body></html>`;
  }

  // ----------------------------------------------------------------------
  // LÓGICA DE DOWNLOAD COM QR CODE (NOVA)
  // ----------------------------------------------------------------------
  // Variáveis do modal
  const modalQR = document.getElementById("modalQR");
  const closeQR = document.querySelector(".close-qr");
  const qrCanvas = document.getElementById("qrcodeCanvas");
  const qrStatus = document.getElementById("qrStatus");
  let zipBlobGlobal = null;

  // Funções para fechar modal
  if (closeQR) closeQR.onclick = () => (modalQR.style.display = "none");
  window.onclick = (event) => {
    if (event.target == modalQR) modalQR.style.display = "none";
  };

  // Botão dentro do modal para baixar no PC se o usuário desistir do QR
  const btnBackup = document.getElementById("btnBaixarPcBackup");
  if (btnBackup) {
    btnBackup.onclick = () => {
      if (zipBlobGlobal) baixarArquivo(zipBlobGlobal);
    };
  }

  // Função auxiliar de download
  function baixarArquivo(blob) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `panorama_360.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  document
    .getElementById("downloadPanorama")
    .addEventListener("click", async () => {
      if (Object.keys(scenes).length === 0)
        return showAlert("Nenhuma cena adicionada!");

      // 1. Pergunta ao usuário
      const choice = confirm(
        "Deseja gerar um QR Code para baixar no celular?\n\n[OK] = Sim, gerar QR Code.\n[Cancelar] = Não, apenas baixar no PC."
      );

      try {
        showAlert("Preparando imagens e gerando ZIP... Aguarde.");
        // Garante que todas as imagens viraram DataURL
        await converterCenasParaDataURL();

        const zip = new JSZip();
        // Adicionamos os arquivos originais por segurança, mas o index.html usará o DataURL
        for (const id in scenes) {
          if (scenes[id].file) zip.file(scenes[id].file.name, scenes[id].file);
        }
        zip.file("index.html", gerarHTMLCompleto());

        zipBlobGlobal = await zip.generateAsync({ type: "blob" });

        if (!choice) {
          // Download direto
          baixarArquivo(zipBlobGlobal);
        } else {
          // Lógica QR Code
          if (typeof QRCode === "undefined") {
            showAlert("Biblioteca QRCode não encontrada. Baixando localmente.");
            return baixarArquivo(zipBlobGlobal);
          }

          // Mostra modal com status "Carregando"
          qrCanvas.innerHTML = "";
          qrStatus.innerText = "Enviando arquivo para nuvem temporária...";
          modalQR.style.display = "flex"; // Usa flex para centralizar (se css estiver ok) ou block

          // Upload para tmpfiles.org
          const formData = new FormData();
          formData.append("file", zipBlobGlobal, "panorama_360.zip");

          const response = await fetch("https://tmpfiles.org/api/v1/upload", {
            method: "POST",
            body: formData,
          });

          if (response.ok) {
            const data = await response.json();
            if (data.status === "success") {
              // A URL retornada é a página de download (o que é bom para mobile)
              const downloadUrl = data.data.url;

              qrStatus.innerText =
                "Escaneie para baixar (Link expira em 60min):";
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
        modalQR.style.display = "none";
      }
    });

  // --- MODAL PASSO A PASSO (Mantido) ---
  const btnPasso = document.getElementById("passoAPasso");
  const modalP = document.getElementById("modalPasso");
  const spanCloseP = modalP ? modalP.querySelector(".close") : null;
  if (btnPasso && modalP) {
    btnPasso.addEventListener("click", () => (modalP.style.display = "block"));
    if (spanCloseP)
      spanCloseP.addEventListener(
        "click",
        () => (modalP.style.display = "none")
      );
  }

  atualizarListaCenas();
  atualizarListaHotspots();
});
