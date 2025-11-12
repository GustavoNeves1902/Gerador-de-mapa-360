let viewer;
let scenes = {};
let currentScene = null;
let addingHotspot = false; 

// Inicializa o viewer
window.addEventListener('DOMContentLoaded', () => {
    if (typeof JSZip === 'undefined' || typeof pannellum === 'undefined') {
        alert("JSZip e/ou Pannellum não carregaram! Verifique a conexão ou os scripts.");
        return;
    }

    viewer = pannellum.viewer('viewer', {
        default: { firstScene: null, autoLoad: true },
        scenes: {}
    });

    // Atualiza a cena atual E a lista de hotspots
    viewer.on('scenechange', sceneId => {
        currentScene = sceneId;
        atualizarListaHotspots(); 
    });

    // --- NOVO: FUNÇÃO PARA REMOVER CENA (Corrigida e Robusta) ---
    window.removerCena = function(sceneIdToRemove) {
        if (!sceneIdToRemove || !scenes[sceneIdToRemove]) {
            alert("Nenhuma cena selecionada ou cena não existe.");
            return;
        }
        
        // Confirmação para evitar remoção acidental
        if (!confirm(`Tem certeza que deseja remover a cena '${scenes[sceneIdToRemove].nome || sceneIdToRemove}' (ID: ${sceneIdToRemove})? Esta ação é irreversível e removerá todos os links para ela.`)) {
            return;
        }

        const nomeRemovido = scenes[sceneIdToRemove].nome || sceneIdToRemove;
        const cenasParaRecarregar = [];

        // 1. Remove a cena do objeto de controle 'scenes'
        delete scenes[sceneIdToRemove];
        
        // 2. Tenta remover a cena do Pannellum viewer
        try {
            viewer.removeScene(sceneIdToRemove);
        } catch (e) {
            console.warn(`Cena ${sceneIdToRemove} não estava totalmente carregada no viewer.`);
        }

        // 3. Itera sobre TODAS as outras cenas para remover hotspots que apontam para a cena removida
        let hotspotsRemovidos = 0;
        for (const id in scenes) {
            if (scenes.hasOwnProperty(id)) {
                const cenaAtual = scenes[id];
                const hotspotsOriginais = cenaAtual.hotSpots.length;
                
                // Filtra os hotspots
                cenaAtual.hotSpots = cenaAtual.hotSpots.filter(hotspot => {
                    if (hotspot.type === 'scene' && hotspot.sceneId === sceneIdToRemove) {
                        hotspotsRemovidos++;
                        return false; // Exclui este hotspot
                    }
                    return true; // Mantém este hotspot
                });
                
                // Se o número de hotspots mudou, esta cena precisa ser recarregada no Pannellum
                if (cenaAtual.hotSpots.length !== hotspotsOriginais) {
                    cenasParaRecarregar.push(id);
                }
            }
        }
        
        // 4. Recarrega as cenas afetadas no Pannellum para limpar os hotspots visuais
        for (const id of cenasParaRecarregar) {
            const cena = scenes[id];
            // Gera uma nova URL temporária (ObjectURL) a partir do objeto File armazenado
            const url = URL.createObjectURL(cena.file); 

            // Substitui a cena no Pannellum com a lista de hotspots limpa
            viewer.addScene(id, {
                type: cena.type,
                panorama: url,
                hotSpots: cena.hotSpots
            }, true); // O 'true' força a substituição e limpeza dos hotspots antigos.
        }

        // 5. Atualiza o estado: Carrega a próxima cena disponível ou limpa
        let novoCurrentScene = Object.keys(scenes)[0] || null;
        currentScene = novoCurrentScene;

        if (novoCurrentScene) {
            viewer.loadScene(novoCurrentScene);
        } else {
            // Reinicia o viewer se não houver mais cenas
            viewer = pannellum.viewer('viewer', {
                default: { firstScene: null, autoLoad: true },
                scenes: {}
            });
            viewer.on('scenechange', sceneId => currentScene = sceneId);
        }

        alert(`Cena '${nomeRemovido}' (ID: ${sceneIdToRemove}) removida com sucesso.\n${hotspotsRemovidos} hotspots ligando para ela também foram removidos de outras cenas.`);
        atualizarListaCenas();
        atualizarListaHotspots();
    }
    // --- FIM DA FUNÇÃO REMOVER CENA ---


    // ----------------------------------------------------------------------
    // 1. ADICIONAR NOVA CENA
    // ----------------------------------------------------------------------
    document.getElementById('addScene').addEventListener('click', () => {
    const fileInput = document.getElementById('fileInput');
    const id = document.getElementById('imageId').value.trim();
    if (!fileInput.files[0] || !id) { alert('Selecione uma imagem e insira um ID.'); return; }
    
    if (scenes[id]) { alert(`ID '${id}' já existe. Escolha outro.`); return; }

    const file = fileInput.files[0];
    const url = URL.createObjectURL(file);
    const nomeImagem = file.name.replace(/\.[^/.]+$/, "");

    scenes[id] = {
        type: "equirectangular",
        nome: nomeImagem,
        file: file,
        hotSpots: []
    };

    viewer.addScene(id, {
        type: "equirectangular",
        panorama: url,
        hotSpots: []
    });

    if (!currentScene) { viewer.loadScene(id); currentScene = id; }
    alert(`Cena '${nomeImagem}' adicionada como ID '${id}'!`);
    atualizarListaCenas();
});

// ----------------------------------------------------------------------
// 2. ATIVAR MODO HOTSPOT (ADIÇÃO)
// ----------------------------------------------------------------------
document.getElementById('addHotspot').addEventListener('click', () => {
    if (!currentScene) { alert('Carregue uma cena primeiro.'); return; }
    addingHotspot = true;
    alert('Modo de hotspot ativado. Clique no panorama para definir a posição.');
});

// ----------------------------------------------------------------------
// 3. REMOVER CENA ATUAL
// ----------------------------------------------------------------------
document.getElementById('removeScene').addEventListener('click', () => {
    if (!currentScene) {
        alert('Nenhuma cena ativa para remover.');
        return;
    }
    // Assume que a função removerCena está definida em outro lugar no escopo global (window)
    window.removerCena(currentScene); 
});

// ----------------------------------------------------------------------
// 4. CLIQUE NO PANORAMA (PARA ADICIONAR HOTSPOT) - COM CORREÇÃO FINAL DO MOUSE
// ----------------------------------------------------------------------
viewer.on('mousedown', event => {
    if (!addingHotspot) return;
    
    // CORREÇÃO: Usa setTimeout para lidar com o caso de falta de cena
    if (!currentScene) {
        setTimeout(() => { alert("Nenhuma cena ativa."); addingHotspot = false; }, 0);
        return;
    }

    const coords = viewer.mouseEventToCoords(event);
    const pitch = coords[0], yaw = coords[1];
    
    // Passo 1: Pede a cena de destino
    const destino = prompt("Digite o ID da cena de destino:");
    
    if (destino && scenes[destino]) {
        const nomeDestino = scenes[destino].nome || destino;
        
        // Passo 2: Pede o ângulo de visão inicial (targetYaw)
        let targetYaw = prompt(`Hotspot para '${nomeDestino}' (ID: ${destino}).\nDigite o ângulo de rotação (Yaw) que a câmera deve ter AO CHEGAR nesta nova cena (ex: 0, 90, -45).`);
        
        targetYaw = parseFloat(targetYaw);
        if (isNaN(targetYaw)) {
             if (!confirm("O valor do Yaw não é válido. Deseja usar 0 como padrão?")) {
                // SUCESSO/CANCELAMENTO DO PROMPT: Usa setTimeout para resetar addingHotspot
                setTimeout(() => { alert("Criação do hotspot cancelada."); addingHotspot = false; }, 0);
                return;
            }
            targetYaw = 0; 
        }
        
        const hotspotId = `hspot_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        const hotspot = { 
            id: hotspotId, 
            pitch, 
            yaw, 
            type: "scene", 
            text: `Ir para ${nomeDestino}`, 
            sceneId: destino,
            targetYaw: targetYaw 
        };
        
        scenes[currentScene].hotSpots.push(hotspot);

        // Adiciona no viewer
        viewer.addHotSpot({ ...hotspot }, currentScene);
        
        // SUCESSO: Usa setTimeout para liberar o mouse e resetar addingHotspot
        setTimeout(() => {
            alert(`Hotspot adicionado ligando '${scenes[currentScene].nome}' → '${nomeDestino}'.\nYaw de destino: ${targetYaw}°`);
            atualizarListaHotspots();
            addingHotspot = false;
        }, 0);

    } else { 
        // ERRO: Usa setTimeout para liberar o mouse e resetar addingHotspot
        setTimeout(() => {
            alert(`Destino inválido! O ID '${destino}' não existe.`); 
            addingHotspot = false;
        }, 0);
    }
});
    
    // ----------------------------------------------------------------------
    // 4. FUNÇÃO PARA REMOVER HOTSPOT (Inalterada)
    // ----------------------------------------------------------------------
    window.removerHotspot = function(hotSpotId) {
        if (!currentScene) return alert("Nenhuma cena ativa para remover hotspots.");

        const sceneId = currentScene;
        const hotspot = scenes[sceneId]?.hotSpots.find(h => h.id === hotSpotId);

        if (!hotspot) return alert("Hotspot não encontrado nos dados.");
        
        if (!confirm(`Tem certeza que deseja remover o hotspot: ${hotspot.text}?`)) return;

        // 1. Remove do viewer (na tela)
        try {
            viewer.removeHotSpot(hotSpotId, sceneId); 
        } catch (e) {
            console.warn(`Hotspot ${hotSpotId} não encontrado no viewer para remoção.`, e);
        }

        // 2. Remove do objeto de dados `scenes`
        if (scenes[sceneId]) {
            scenes[sceneId].hotSpots = scenes[sceneId].hotSpots.filter(h => h.id !== hotSpotId);
        }
        
        alert(`Hotspot removido!`);
        atualizarListaHotspots();
    };

    // ----------------------------------------------------------------------
    // 5. FUNÇÃO PARA EDITAR HOTSPOT (Inalterada)
    // ----------------------------------------------------------------------
    window.editarHotspot = function(hotSpotId) {
        if (!currentScene) return alert("Nenhuma cena ativa.");
        
        const sceneId = currentScene;
        const hotspotIndex = scenes[sceneId]?.hotSpots.findIndex(h => h.id === hotSpotId);

        if (hotspotIndex === -1 || !scenes[sceneId]) return alert("Hotspot não encontrado.");

        const hotspot = scenes[sceneId].hotSpots[hotspotIndex];
        const nomeDestinoAntigo = scenes[hotspot.sceneId]?.nome || hotspot.sceneId;

        // Pede o novo ID de destino
        const novoDestino = prompt(
            `Editando Hotspot: ${hotspot.text}\n\nDigite o NOVO ID da cena de destino (Atual: ${hotspot.sceneId}):`,
            hotspot.sceneId
        );

        if (novoDestino === null) return; 

        if (!scenes[novoDestino]) {
            return alert(`Destino inválido: O ID '${novoDestino}' não existe. Edição cancelada.`);
        }

        // Pede o novo targetYaw
        let novoTargetYaw = prompt(
            `Hotspot para '${novoDestino}'.\n\nDigite o NOVO ângulo de rotação (Target Yaw) ao chegar (Atual: ${hotspot.targetYaw}°):`,
            hotspot.targetYaw
        );

        if (novoTargetYaw === null) return; 

        // Validação do Yaw
        novoTargetYaw = parseFloat(novoTargetYaw);
        if (isNaN(novoTargetYaw)) {
            return alert("O valor do Target Yaw não é válido. Edição cancelada.");
        }

        // 1. Atualiza o objeto de dados interno
        const nomeDestinoNovo = scenes[novoDestino].nome || novoDestino;

        hotspot.sceneId = novoDestino;
        hotspot.targetYaw = novoTargetYaw;
        hotspot.text = `Ir para ${nomeDestinoNovo}`;

        // 2. Remove o hotspot antigo do viewer
        try {
            viewer.removeHotSpot(hotSpotId, sceneId);
        } catch (e) {
            console.warn("Erro ao remover hotspot antigo:", e);
        }

        // 3. Adiciona o hotspot atualizado de volta ao viewer
        viewer.addHotSpot({ ...hotspot }, sceneId);
        
        alert(`Hotspot editado com sucesso: ${nomeDestinoAntigo} → ${nomeDestinoNovo} (Yaw: ${novoTargetYaw}°)!`);
        
        // 4. Atualiza a lista na tela
        atualizarListaHotspots();
    };

    // ----------------------------------------------------------------------
    // 6. ATUALIZAR LISTA DE HOTSPOTS (Inalterada)
    // ----------------------------------------------------------------------
    function atualizarListaHotspots() {
        let listContainer = document.getElementById("hotspotListContainer");
        if (!listContainer) {
            listContainer = document.createElement("div");
            listContainer.id = "hotspotListContainer";
            // Assumindo que este container deve ser inserido antes do #viewer
            document.body.insertBefore(listContainer, document.getElementById("viewer"));
        }

        listContainer.innerHTML = ''; 
        // Adicionando um estilo básico para o container da lista de hotspots
        //listContainer.style.padding = '10px';
        //listContainer.style.backgroundColor = '#f8f8f8';
        //listContainer.style.border = '1px solid #ddd';

        if (!currentScene || !scenes[currentScene]) {
            listContainer.innerHTML = "<h4>Nenhum Hotspot para exibir.</h4>";
            return;
        }

        const currentSceneData = scenes[currentScene];
        const title = document.createElement('h4');
        title.textContent = `Hotspots em "${currentSceneData.nome || currentScene}":`;
        listContainer.appendChild(title);

        if (currentSceneData.hotSpots.length === 0) {
            listContainer.innerHTML += "<p>Nenhum hotspot adicionado nesta cena.</p>";
            return;
        }

        const ul = document.createElement("ul");
        ul.style.listStyle = 'none';
        ul.style.padding = '0';
        ul.style.maxHeight = '200px';
        ul.style.overflowY = 'auto';

        currentSceneData.hotSpots.forEach(hotspot => {
            const li = document.createElement("li");
            li.style.margin = '5px 0';
            li.style.padding = '5px';
            li.style.borderBottom = '1px dotted #ccc';

            const btnRemove = document.createElement("button");
            btnRemove.textContent = "Remover";
            btnRemove.style.marginLeft = '10px';
            btnRemove.style.background = '#dc3545';
            btnRemove.style.color = 'white';
            btnRemove.style.border = 'none';
            btnRemove.style.padding = '4px 8px';
            btnRemove.style.cursor = 'pointer';
            btnRemove.onclick = () => window.removerHotspot(hotspot.id);
            
            const btnEdit = document.createElement("button");
            btnEdit.textContent = "Editar";
            btnEdit.style.marginLeft = '5px';
            btnEdit.style.background = '#ffc107';
            btnEdit.style.color = 'black';
            btnEdit.style.border = 'none';
            btnEdit.style.padding = '4px 8px';
            btnEdit.style.cursor = 'pointer';
            btnEdit.onclick = () => window.editarHotspot(hotspot.id);


            // Conteúdo do item da lista
            const destinoNome = scenes[hotspot.sceneId]?.nome || hotspot.sceneId;
            const targetYawInfo = hotspot.targetYaw !== undefined ? ` (Target Yaw: ${hotspot.targetYaw.toFixed(0)}°)` : '';

            li.innerHTML = `→ ${destinoNome}${targetYawInfo} (Pitch: ${hotspot.pitch.toFixed(1)}, Yaw: ${hotspot.yaw.toFixed(1)})`;
            li.appendChild(btnEdit); 
            li.appendChild(btnRemove);
            ul.appendChild(li);
        });

        listContainer.appendChild(ul);
    }
    
    // ----------------------------------------------------------------------
    // 7. FUNÇÕES DE UTILIDADE E DOWNLOAD
    // ----------------------------------------------------------------------

    // Dropdown de cenas para navegação (na interface de edição) - CORRIGIDO O FUNDO BRANCO
    function atualizarListaCenas() {
        let existingSelectContainer = document.getElementById("sceneSelectContainer");
        if (existingSelectContainer) existingSelectContainer.remove();

        const select = document.createElement("select");
        select.id = "sceneSelect";
        select.title = "Selecione a cena para visualizar/editar";

        const container = document.createElement("div");
        container.id = "sceneSelectContainer";
        container.style.padding = "10px";
        // CORREÇÃO: Removendo o background-color: #fff para evitar a faixa branca
        container.style.textAlign = "center";
        container.appendChild(select);

        Object.keys(scenes).forEach(id => {
            const opt = document.createElement("option");
            opt.value = id;
            opt.textContent = scenes[id].nome || id;
            select.appendChild(opt);
        });

        if (currentScene && scenes[currentScene]) {
            select.value = currentScene;
        } else if (Object.keys(scenes).length > 0) {
            select.value = Object.keys(scenes)[0];
        }

        select.addEventListener("change", e => {
            const id = e.target.value;
            viewer.loadScene(id);
        });
        
        // Insere o dropdown somente se houver cenas
        if (Object.keys(scenes).length > 0) {
            document.body.insertBefore(container, document.getElementById("viewer"));
        }
    }

    // Converte todos arquivos de imagens para Data URL
    function converterCenasParaDataURL() {
        const promises = [];
        for (const id in scenes) {
            const scene = scenes[id];
            if(scene.file && !scene.dataURL) {
                promises.push(new Promise(resolve => {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        scene.dataURL = e.target.result;
                        resolve();
                    };
                    reader.readAsDataURL(scene.file);
                }));
            }
        }
        return Promise.all(promises);
    }

    // Gera HTML offline com todas as cenas embutidas (Data URL)
    function gerarHTMLCompleto() {
        const scenesData = {};
        const sceneOptions = []; 
        let firstSceneId = null;

        for (const id in scenes) {
            const s = scenes[id];
            
            if (!firstSceneId) firstSceneId = id; 

            scenesData[id] = {
                type: s.type,
                panorama: s.dataURL,
                hotSpots: s.hotSpots.map(h => {
                    const hotspotData = {
                        pitch: h.pitch,
                        yaw: h.yaw,
                        type: h.type,
                        text: h.text,
                        sceneId: h.sceneId,
                    };
                    
                    if (h.targetYaw !== undefined) {
                        hotspotData.targetYaw = h.targetYaw;
                    }
                    
                    return hotspotData;
                })
            };
            
            const nomeCena = s.nome || id;
            const selectedAttr = (id === firstSceneId) ? 'selected' : '';
            sceneOptions.push(`<option value="${id}" ${selectedAttr}>${nomeCena}</option>`);
        }
        
        // Constrói o HTML do dropdown de navegação
        const navigationMenuHTML = `
            <div id="scene-nav-menu" style="position:fixed; top:10px; left:10px; z-index:9999; background: rgba(0,0,0,0.6); padding: 5px; border-radius: 5px;">
                <label style="color:white; font-weight:bold; font-size: 14px;">Ir para:</label>
                <select id="jumpToScene" onchange="viewer.loadScene(this.value);">
                    ${sceneOptions.join('\n')}
                </select>
            </div>
        `;


        return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Panorama 360º Offline</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css"/>
<script src="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js"></script>
<style>
    body { margin: 0; overflow: hidden; }
    #viewer { width: 100%; height: 100vh; }
    #scene-nav-menu label, #scene-nav-menu select {
        vertical-align: middle;
    }
</style>
</head>
<body>
${navigationMenuHTML} <div id="viewer"></div>
<script>
let viewer; 
const scenes = ${JSON.stringify(scenesData, null, 2)};
viewer = pannellum.viewer('viewer', {
    default: { firstScene: '${firstSceneId}', autoLoad: true },
    scenes: scenes
});

window.viewer = viewer; 
</script>
</body>
</html>
        `;
    }

    // Download do ZIP totalmente offline
    document.getElementById('downloadPanorama').addEventListener('click', async () => {
        if (Object.keys(scenes).length === 0) return alert("Nenhuma cena adicionada para download!");

        try {
            alert("Preparando imagens... Isso pode levar um momento para panoramas grandes.");
            await converterCenasParaDataURL();
            const zip = new JSZip();

            for (const id in scenes) {
                if(scenes[id].file) {
                    zip.file(scenes[id].file.name, scenes[id].file);
                }
            }

            zip.file('index.html', gerarHTMLCompleto());

            const content = await zip.generateAsync({ type: "blob" });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = `panorama_360.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
            alert("Download gerado com sucesso!");
        } catch (err) {
            console.error("Erro ao gerar ZIP:", err);
            alert("Ocorreu um erro ao gerar o download.");
        }
    });

    // ----------------------------------------------------------------------
    // 8. FUNCIONALIDADE DO MODAL (PASSO A PASSO) (Inalterado)
    // ----------------------------------------------------------------------
    const btnPasso = document.getElementById("passoAPasso");
    const modal = document.getElementById("modalPasso");
    const spanClose = modal ? modal.querySelector(".close") : null; 

    if (btnPasso && modal) {
        btnPasso.addEventListener("click", () => {
            modal.style.display = "block";
        });

        if (spanClose) {
            spanClose.addEventListener("click", () => {
                modal.style.display = "none";
            });
        }

        window.addEventListener("click", (event) => {
            if (event.target === modal) {
                modal.style.display = "none";
            }
        });
    }
    
    atualizarListaCenas();
    atualizarListaHotspots();

});