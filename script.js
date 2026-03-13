import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, onValue, push, remove, set, update } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// ==========================================
// 🔴 ATENÇÃO: CONFIGURAÇÃO DO FIREBASE (NUVEM)
// ==========================================
// Para que os dados sejam salvos na nuvem e todos os usuários vejam
// as atualizações em tempo real, você precisa criar um banco de dados:
// 1. Acesse: https://console.firebase.google.com/
// 2. Crie um projeto gratuito e clique no ícone Web (</>) para registrar um app
// 3. No menu à esquerda, vá em "Criação" > "Realtime Database" > "Criar Banco de Dados"
//    (IMPORTANTE: Inicie em "Modo de Teste" para permitir leitura/escrita)
// 4. Copie as chaves do seu projeto e substitua abaixo:

const firebaseConfig = {
    apiKey: "AIzaSyBWjGpgbAmLHr2bAyV97MHa9S63S-rUTVo",
    authDomain: "posto-30039.firebaseapp.com",
    databaseURL: "https://posto-30039-default-rtdb.firebaseio.com",
    projectId: "posto-30039",
    storageBucket: "posto-30039.firebasestorage.app",
    messagingSenderId: "627792021540",
    appId: "1:627792021540:web:2bfa2f3ac2d957b689b0b1",
    measurementId: "G-KEQRFLJF0G"
};

// Verifica se você já configurou o Firebase
const isFirebaseConfigured = firebaseConfig.apiKey !== "SUA_API_KEY_AQUI";

let stations = [];
let db = null;
let stationsRef = null;

if (isFirebaseConfigured) {
    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    stationsRef = ref(db, 'gas-stations');
} else {
    console.warn("⚠️ Firebase não configurado. O aplicativo funcionará apenas localmente no seu dispositivo.");
    // Modo Fallback: carrega do armazenamento local do celular/PC
    stations = JSON.parse(localStorage.getItem('gasStations')) || [];
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('price-form');
    const stationNameInput = document.getElementById('station-name');
    const fuelTypeInput = document.getElementById('fuel-type');
    const priceInput = document.getElementById('price');
    const stationsList = document.getElementById('stations-list');
    const filterFuel = document.getElementById('filter-fuel');

    const submitBtn = document.getElementById('submit-btn');
    const submitText = document.getElementById('submit-text');
    const submitIcon = submitBtn.querySelector('i');
    const cancelBtn = document.getElementById('cancel-btn');
    const latInput = document.getElementById('latitude');
    const lngInput = document.getElementById('longitude');
    const getLocationBtn = document.getElementById('get-location-btn');
    const locationStatus = document.getElementById('location-status');
    const gmapsLinkInput = document.getElementById('gmaps-link');

    let editingId = null;
    
    // Configuração de Mapas (Leaflet)
    let pickerMap = null;
    let pickerMarker = null;
    let mainMap = null;
    let mainMarkers = []; // Array para segurar as referencias aos marcadores do mapa principal

    // Define icone de posto
    const pumpIcon = L.divIcon({
        html: '<i class="fa-solid fa-gas-pump" style="color: white; font-size: 16px; background: var(--primary); padding: 8px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></i>',
        className: 'custom-div-icon',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18]
    });

    const editIcon = L.divIcon({
        html: '<i class="fa-solid fa-location-dot" style="color: var(--accent-red); font-size: 32px; filter: drop-shadow(0px 3px 2px rgba(0,0,0,0.4));"></i>',
        className: 'custom-div-icon',
        iconSize: [32, 32],
        iconAnchor: [16, 32]
    });

    // Stats values elements
    const cheapestPriceEl = document.getElementById('cheapest-price');
    const cheapestStationEl = document.getElementById('cheapest-station');
    const averagePriceEl = document.getElementById('average-price');
    const expensivePriceEl = document.getElementById('expensive-price');
    const expensiveStationEl = document.getElementById('expensive-station');

    // ==========================================
    // MAPAS
    // ==========================================
    function initMaps() {
        // Centro default: Brasil (padrão se GPS não for ativado)
        const defaultCenter = [-14.235004, -51.92528]; 
        const defaultZoom = 4;

        // 1. Mapa de Escolha (no Formulário)
        pickerMap = L.map('picker-map').setView(defaultCenter, defaultZoom);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(pickerMap);

        // Click no mapa para colocar pino manual
        pickerMap.on('click', function(e) {
            setPickerLocation(e.latlng.lat, e.latlng.lng);
        });

        // 2. Mapa Principal (Painel Dashboard)
        mainMap = L.map('main-map').setView(defaultCenter, defaultZoom);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(mainMap);
    }

    function setPickerLocation(lat, lng, panMap = false) {
        latInput.value = lat;
        lngInput.value = lng;
        
        if (pickerMarker) {
            pickerMarker.setLatLng([lat, lng]);
        } else {
            pickerMarker = L.marker([lat, lng], {icon: editIcon}).addTo(pickerMap);
        }
        
        if (panMap) {
            pickerMap.setView([lat, lng], 15);
        }
    }

    // Extrair GPS do link do Google Maps
    gmapsLinkInput.addEventListener('input', (e) => {
        const url = e.target.value.trim();
        if(!url) return;
        
        let lat = null, lng = null;
        
        let exactMatch = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
        if (exactMatch) {
            lat = parseFloat(exactMatch[1]);
            lng = parseFloat(exactMatch[2]);
        } else {
            let viewportMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
            if (viewportMatch) {
                lat = parseFloat(viewportMatch[1]);
                lng = parseFloat(viewportMatch[2]);
            }
        }

        if (lat && lng) {
            setPickerLocation(lat, lng, true);
            locationStatus.textContent = "Coordenadas capturadas do link com sucesso!";
            locationStatus.className = "status-msg success";
        } else if (url.includes('goo.gl') || url.includes('maps.app.goo.gl')) {
            locationStatus.textContent = "Aviso: Abra o link curto no navegador, espere carregar, e copie o link completo/longo de lá.";
            locationStatus.className = "status-msg error";
        }
    });

    // Solicitar GPS do usuário
    getLocationBtn.addEventListener('click', () => {
        if (!navigator.geolocation) {
            locationStatus.textContent = "Geolocalização não é suportada pleo seu navegador";
            locationStatus.className = "status-msg error";
            return;
        }

        locationStatus.textContent = "Buscando localização...";
        locationStatus.className = "status-msg";
        getLocationBtn.disabled = true;

        navigator.geolocation.getCurrentPosition(
            (position) => {
                setPickerLocation(position.coords.latitude, position.coords.longitude, true);
                locationStatus.textContent = "Localização capturada!";
                locationStatus.className = "status-msg success";
                getLocationBtn.disabled = false;
            },
            () => {
                locationStatus.textContent = "Não foi possível pegar a localização. Arraste no mapa.";
                locationStatus.className = "status-msg error";
                getLocationBtn.disabled = false;
            }
        );
    });

    // Inicializa a UI do mapa
    initMaps();

    // ==========================================
    // INICIALIZAÇÃO E SINCRONIZAÇÃO EM TEMPO REAL
    // ==========================================
    if (isFirebaseConfigured) {
        // Escuta as mudanças no Firebase em tempo real (qualquer pessoa que adicionar, aparecerá aqui)
        onValue(stationsRef, (snapshot) => {
            const data = snapshot.val();
            stations = [];
            if (data) {
                // Converte o objeto do Firebase num Array
                Object.keys(data).forEach(key => {
                    stations.push({
                        id: key,
                        ...data[key]
                    });
                });
            }
            updateUI();
        });
    } else {
        updateUI(); // Se não tem nuvem, apenas atualiza com os dados locais
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const name = stationNameInput.value.trim();
        const fuel = fuelTypeInput.value;
        const price = parseFloat(priceInput.value);
        const lat = latInput.value;
        const lng = lngInput.value;

        if (name && fuel && price > 0) {
            if (!lat || !lng) {
                alert("Por favor, informe a localização do posto pelo GPS ou clicando no mapinha.");
                return;
            }

            const stationData = {
                name,
                fuel,
                price,
                lat: parseFloat(lat),
                lng: parseFloat(lng),
                timestamp: Date.now()
            };

            if (editingId) {
                // Modo Edição
                if (isFirebaseConfigured) {
                    const itemRef = ref(db, 'gas-stations/' + editingId);
                    update(itemRef, stationData);
                } else {
                    const index = stations.findIndex(s => s.id === editingId);
                    if (index !== -1) {
                        stations[index] = { ...stations[index], ...stationData };
                        localStorage.setItem('gasStations', JSON.stringify(stations));
                        updateUI();
                    }
                }
                window.cancelEdit(); // Volta ao normal
            } else {
                // Modo Criação
                if (isFirebaseConfigured) {
                    push(stationsRef, stationData);
                } else {
                    stationData.id = Date.now().toString();
                    stations.push(stationData);
                    localStorage.setItem('gasStations', JSON.stringify(stations));
                    updateUI();
                }
            }

            // Limpa o formulário
            stationNameInput.value = '';
            priceInput.value = '';
            latInput.value = '';
            lngInput.value = '';
            gmapsLinkInput.value = '';
            if (pickerMarker) {
                pickerMap.removeLayer(pickerMarker);
                pickerMarker = null;
            }
            locationStatus.textContent = "";
            stationNameInput.focus();
        }
    });

    filterFuel.addEventListener('change', updateUI);

    // Render list
    function renderList(filteredStations) {
        stationsList.innerHTML = '';

        if (filteredStations.length === 0) {
            stationsList.innerHTML = `<tr class="empty-row"><td colspan="4">Nenhum posto registrado para o filtro.</td></tr>`;
            return;
        }

        filteredStations.forEach(station => {
            const row = document.createElement('tr');

            row.innerHTML = `
                <td data-label="Posto"><strong>${escapeHTML(station.name)}</strong></td>
                <td data-label="Combustível"><span class="fuel-badge">${escapeHTML(station.fuel)}</span></td>
                <td data-label="Preço"><strong>${formatCurrency(station.price)}</strong></td>
                <td data-label="Ação">
                    <div class="action-buttons">
                        <a href="https://www.google.com/maps/search/?api=1&query=${station.lat},${station.lng}" target="_blank" class="btn-maps" title="Traçar Rota no Maps">
                            <i class="fa-solid fa-map-location-dot"></i>
                        </a>
                        <button class="btn-edit" onclick="window.editStation('${station.id}')" title="Editar">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn-delete" onclick="window.deleteStation('${station.id}')" title="Remover">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;

            stationsList.appendChild(row);
        });
    }

    function updateStats(filteredStations) {
        if (filteredStations.length === 0) {
            cheapestPriceEl.textContent = 'R$ 0,00';
            cheapestStationEl.textContent = '-';
            averagePriceEl.textContent = 'R$ 0,00';
            expensivePriceEl.textContent = 'R$ 0,00';
            expensiveStationEl.textContent = '-';
            return;
        }

        let minPrice = Infinity;
        let maxPrice = -Infinity;
        let minStation = '';
        let maxStation = '';
        let sum = 0;

        filteredStations.forEach(station => {
            if (station.price < minPrice) {
                minPrice = station.price;
                minStation = station.name;
            }
            if (station.price > maxPrice) {
                maxPrice = station.price;
                maxStation = station.name;
            }
            sum += station.price;
        });

        const avgPrice = sum / filteredStations.length;

        cheapestPriceEl.textContent = formatCurrency(minPrice);
        cheapestStationEl.textContent = minStation;
        expensivePriceEl.textContent = formatCurrency(maxPrice);
        expensiveStationEl.textContent = maxStation;
        averagePriceEl.textContent = formatCurrency(avgPrice);
    }

    function updateMapMarkers(filteredStations) {
        // Limpar os marcadores anteriores do mapa principal
        mainMarkers.forEach(marker => mainMap.removeLayer(marker));
        mainMarkers = [];

        if (filteredStations.length === 0) return;

        // Fazer um bouding box pra ajustar a tela pros postos visíveis
        const bounds = [];

        filteredStations.forEach(station => {
            if (station.lat && station.lng) {
                const marker = L.marker([station.lat, station.lng], {icon: pumpIcon})
                    .addTo(mainMap)
                    .bindPopup(`
                        <div style="font-family: 'Inter', sans-serif; min-width: 140px;">
                            <strong style="font-size: 1.1em; color: var(--primary);">${escapeHTML(station.name)}</strong><br>
                            <span style="color: #666; font-size: 0.9em;">Tipo: ${escapeHTML(station.fuel)}</span><br>
                            <strong style="font-size: 1.25em; margin-top: 5px; display: inline-block;">${formatCurrency(station.price)}</strong><br>
                            <a href="https://www.google.com/maps/search/?api=1&query=${station.lat},${station.lng}" target="_blank" style="display:inline-block; margin-top:10px; padding:6px 10px; background:var(--primary); color:white; text-decoration:none; border-radius:4px; font-weight:bold; font-size:0.85em;">
                                <i class="fa-solid fa-diamond-turn-right"></i> Abrir no Maps
                            </a>
                        </div>
                    `);
                
                mainMarkers.push(marker);
                bounds.push([station.lat, station.lng]);
            }
        });

        // Ajustar zoom da tela principal para caber todos os pinos achados no filtro
        if (bounds.length > 0) {
            mainMap.fitBounds(bounds, {padding: [50, 50], maxZoom: 15});
        }
    }

    function updateUI() {
        const filterValue = filterFuel.value;
        const filteredStations = filterValue === 'Todos'
            ? stations
            : stations.filter(s => s.fuel === filterValue);

        // Sort by price
        filteredStations.sort((a, b) => a.price - b.price);

        renderList(filteredStations);
        updateStats(filteredStations);
        updateMapMarkers(filteredStations);
    }

    window.editStation = function (id) {
        const station = stations.find(s => s.id === id);
        if (station) {
            stationNameInput.value = station.name;
            fuelTypeInput.value = station.fuel;
            priceInput.value = station.price;
            
            if (station.lat && station.lng) {
                setPickerLocation(station.lat, station.lng, true);
            }

            editingId = id;
            submitText.textContent = 'Salvar Edição';
            submitIcon.className = 'fa-solid fa-check';
            cancelBtn.classList.remove('hidden');

            // Rolar a tela para o formulário no mobile
            document.querySelector('.input-section').scrollIntoView({ behavior: 'smooth' });
            stationNameInput.focus();
        }
    };

    window.cancelEdit = function () {
        editingId = null;
        stationNameInput.value = '';
        priceInput.value = '';
        latInput.value = '';
        lngInput.value = '';
        gmapsLinkInput.value = '';
        if (pickerMarker) {
            pickerMap.removeLayer(pickerMarker);
            pickerMarker = null;
        }

        submitText.textContent = 'Adicionar';
        submitIcon.className = 'fa-solid fa-plus';
        cancelBtn.classList.add('hidden');
    };

    // Expondo função globalmente para o botão "Remover" do HTML funcionar
    window.deleteStation = function (id) {
        if (confirm('Deseja realmente remover este registro para todos?')) {
            if (isFirebaseConfigured) {
                // Deleta da nuvem
                const itemRef = ref(db, 'gas-stations/' + id);
                remove(itemRef).catch(console.error);
            } else {
                // Deleta localmente
                stations = stations.filter(s => s.id !== id);
                localStorage.setItem('gasStations', JSON.stringify(stations));
                updateUI();
            }
        }
    };

    function formatCurrency(value) {
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function escapeHTML(str) {
        return (str || '').toString().replace(/[&<>'"]/g,
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag])
        );
    }
});
