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

    let editingId = null;

    // Stats values elements
    const cheapestPriceEl = document.getElementById('cheapest-price');
    const cheapestStationEl = document.getElementById('cheapest-station');
    const averagePriceEl = document.getElementById('average-price');
    const expensivePriceEl = document.getElementById('expensive-price');
    const expensiveStationEl = document.getElementById('expensive-station');

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

        if (name && fuel && price > 0) {
            const stationData = {
                name,
                fuel,
                price,
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

    function updateUI() {
        const filterValue = filterFuel.value;
        const filteredStations = filterValue === 'Todos'
            ? stations
            : stations.filter(s => s.fuel === filterValue);

        // Sort by price
        filteredStations.sort((a, b) => a.price - b.price);

        renderList(filteredStations);
        updateStats(filteredStations);
    }

    window.editStation = function (id) {
        const station = stations.find(s => s.id === id);
        if (station) {
            stationNameInput.value = station.name;
            fuelTypeInput.value = station.fuel;
            priceInput.value = station.price;

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
