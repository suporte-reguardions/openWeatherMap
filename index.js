require('dotenv').config();
const axios = require('axios');

const CITY_IDS = [
    // EUROPA
    2643743, // London (Reino Unido)
    2643123, // Manchester (Reino Unido)
    2644210, // Liverpool (Reino Unido)
    2650225, // Edinburgh (Escócia)
    2964574, // Dublin (Irlanda)
    2655984, // Belfast (Irlanda do Norte)
    2759794, // Amsterdam (Holanda)
    2800866, // Brussels (Bélgica)
    2803138, // Antwerp (Bélgica)
    2988507, // Paris (França)
    3031582, // Bordeaux (França)
    2618425, // Copenhagen (Dinamarca)
    3143244, // Oslo (Noruega)
    2673730, // Stockholm (Suécia)
    658225,  // Helsinki (Finlândia)
    2657896, // Zurich (Suíça)
    2660646, // Geneva (Suíça)
    3173435, // Milan (Itália)
    3164603, // Venice (Itália)
    3169070, // Rome (Itália)
    2761369, // Vienna (Áustria)
    2950159, // Berlin (Alemanha)
    756135,  // Warsaw (Polônia)
    3067696, // Prague (Rep. Checa)
    2735943, // Porto (Portugal)
    2267057, // Lisbon (Portugal)

    // AMÉRICAS
    5809844, // Seattle (EUA)
    5746545, // Portland (EUA)
    6173331, // Vancouver (Canadá)
    5128581, // New York (EUA)
    4930956, // Boston (EUA)
    4887398, // Chicago (EUA)
    6167865, // Toronto (Canadá)
    6077243, // Montreal (Canadá)
    3448439, // São Paulo (Brasil)
    3451190, // Rio de Janeiro (Brasil)
    3688689, // Bogota (Colômbia)
    3435910, // Buenos Aires (Argentina)

    // ÁSIA
    1850147, // Tokyo (Japão)
    1857910, // Kyoto (Japão)
    1853908, // Osaka (Japão)
    1668341, // Taipei (Taiwan)
    1819729, // Hong Kong (China)
    1880252, // Singapore (Singapura)
    1735161, // Kuala Lumpur (Malásia)
    1609350, // Bangkok (Tailândia)
    1566083, // Ho Chi Minh City (Vietnã)
    1581130, // Hanoi (Vietnã)
    1275339, // Mumbai (Índia)

    // OCEANIA
    2147714, // Sydney (Austrália)
    2193733, // Auckland (Nova Zelândia)
    2179537  // Wellington (Nova Zelândia)
];

const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const OPENWEATHER_KEY = process.env.OPENWEATHER_API_KEY;

// --- CONFIGURAÇÃO DE TIMEOUT ---
const SHOPIFY_TIMEOUT = 10000; // 10 segundos para a Shopify

async function getShopId() {
    try {
        const response = await axios.get(`https://${SHOPIFY_SHOP}/admin/api/2024-01/shop.json`, {
            headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN },
            timeout: SHOPIFY_TIMEOUT // <--- Adicionado aqui
        });
        return response.data.shop.id;
    } catch (error) {
        console.error("\nErro ao pegar ID da loja:", error.message);
        return null;
    }
}

async function getCurrentShopifyCity() {
    const url = `https://${SHOPIFY_SHOP}/admin/api/2024-01/graphql.json`;
    const query = `
      {
        shop {
          metafield(namespace: "custom", key: "cidade_chovendo") {
            value
          }
        }
      }
    `;
    try {
        const response = await axios.post(url, { query }, {
            headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN },
            timeout: SHOPIFY_TIMEOUT // <--- Adicionado aqui
        });
        return response.data.data.shop.metafield ? response.data.data.shop.metafield.value : null;
    } catch (error) {
        return null;
    }
}

async function getCityWeather(id) {

    // Timeout para evitar travamentos se a API demorar
    const url = `https://api.openweathermap.org/data/2.5/weather?id=${id}&units=metric&appid=${OPENWEATHER_KEY}`;
    try {
        const response = await axios.get(url, { timeout: 5000 });
        return response.data;
    } catch (error) {
        // Ignora erros individuais
        return null;
    }
}

async function updateShopifyMetafield(cityName) {
    const shopId = await getShopId();
    if (!shopId) return;

    const url = `https://${SHOPIFY_SHOP}/admin/api/2024-01/graphql.json`;
    const value = cityName ? cityName : "Nenhuma"; 

    const query = `
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { key value }
          userErrors { field message }
        }
      }
    `;

    const variables = {
      metafields: [{
          namespace: "custom",
          key: "cidade_chovendo",
          ownerId: `gid://shopify/Shop/${shopId}`,
          type: "single_line_text_field",
          value: value
      }]
    };

    try {
        await axios.post(url, { query, variables }, {
            headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN },
            timeout: SHOPIFY_TIMEOUT // <--- Adicionado aqui
        });
        console.log(`Shopify atualizado/mantido com: [ ${value} ]`);
    } catch (error) {
        console.error("\nErro ao atualizar Shopify:", error.message);
    }
}

async function checkWeather() {
    console.log(`Monitorando ${CITY_IDS.length} cidades`);
    
    // Busca todas em paralelo
    const promises = CITY_IDS.map(id => getCityWeather(id));
    const results = await Promise.all(promises);

    // Filtra Chuva
    const rainingCities = results.filter(city => {
        if (!city) return false; 
        const weatherId = city.weather[0].id;
        return weatherId >= 200 && weatherId < 600;
    });

    console.log(`Encontradas ${rainingCities.length} cidades com chuva.`);

    if (rainingCities.length > 0) {
        console.log(`Lista: [ ${rainingCities.map(c => c.name).join(', ')} ]`);
    }

    // Lógica de Memória
    const currentCityOnSite = await getCurrentShopifyCity();
    
    if (rainingCities.length > 0) {
        let chosenCity;
        // Verifica se a cidade atual ainda está chovendo
        const stillRainingInCurrent = rainingCities.find(c => c.name === currentCityOnSite);

        if (stillRainingInCurrent) {
            console.log(`-> A cidade atual (${currentCityOnSite}) continua chovendo. Mantendo-a.`);
            chosenCity = stillRainingInCurrent;
        } else {
            // Sorteia nova
            chosenCity = rainingCities[Math.floor(Math.random() * rainingCities.length)];
            console.log(`\nNova cidade sorteada: ${chosenCity.name}`);
        }
        
        await updateShopifyMetafield(chosenCity.name);
    } else {
        console.log("\nSol nas 30 cidades -> Limpando aviso.");
        await updateShopifyMetafield(null);
    }
}

checkWeather();