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
  //1566083,  Ho Chi Minh City (Vietnã)
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

// --- CONFIG NOVA (chuva forte + streak) ---
const HEAVY_RAIN_1H_MM = 2.5;   // >= 2.5mm na última 1h
const HEAVY_RAIN_3H_MM = 7.5;   // >= 7.5mm nas últimas 3h
const STREAK_WEIGHT = 1.5;      // peso da duração (em checks)
const INTENSITY_WEIGHT = 10;    // peso da intensidade (mm/h)
const MAX_STREAK_ENTRIES = 200; // limita o tamanho do JSON salvo no metafield

async function getShopId() {
  try {
    const response = await axios.get(`https://${SHOPIFY_SHOP}/admin/api/2024-01/shop.json`, {
      headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN },
      timeout: SHOPIFY_TIMEOUT
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
      timeout: SHOPIFY_TIMEOUT
    });
    return response.data.data.shop.metafield ? response.data.data.shop.metafield.value : null;
  } catch (error) {
    return null;
  }
}

// --- NOVO: ler streaks (por ID) de metafield ---
async function getRainStreaks() {
  const url = `https://${SHOPIFY_SHOP}/admin/api/2024-01/graphql.json`;
  const query = `
    {
      shop {
        metafield(namespace: "custom", key: "rain_streaks") {
          value
        }
      }
    }
  `;

  try {
    const response = await axios.post(url, { query }, {
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN },
      timeout: SHOPIFY_TIMEOUT
    });

    const raw = response.data.data.shop.metafield?.value;
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
    return {};
  } catch (e) {
    return {};
  }
}

// --- NOVO: salvar streaks (por ID) em metafield ---
async function setRainStreaks(shopId, streaksObj) {
  const url = `https://${SHOPIFY_SHOP}/admin/api/2024-01/graphql.json`;

  const query = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { key value }
        userErrors { field message }
      }
    }
  `;

  const value = JSON.stringify(streaksObj);

  const variables = {
    metafields: [{
      namespace: "custom",
      key: "rain_streaks",
      ownerId: `gid://shopify/Shop/${shopId}`,
      type: "single_line_text_field",
      value
    }]
  };

  try {
    await axios.post(url, { query, variables }, {
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN },
      timeout: SHOPIFY_TIMEOUT
    });
  } catch (error) {
    console.error("\nErro ao salvar rain_streaks:", error.message);
  }
}

async function getCityWeather(id) {
  const url = `https://api.openweathermap.org/data/2.5/weather?id=${id}&units=metric&appid=${OPENWEATHER_KEY}`;
  try {
    const response = await axios.get(url, { timeout: 5000 });
    return response.data;
  } catch (error) {
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
      timeout: SHOPIFY_TIMEOUT
    });
    console.log(`Shopify atualizado/mantido com: [ ${value} ]`);
  } catch (error) {
    console.error("\nErro ao atualizar Shopify:", error.message);
  }
}

// --- NOVO: helpers de chuva/score ---
function isRainingNow(city) {
  const wid = city?.weather?.[0]?.id;
  return (wid >= 300 && wid < 600);
}

function getIntensityMMperH(city) {
  const r1 = city?.rain?.['1h'] ?? 0;
  const r3 = city?.rain?.['3h'] ?? 0;
  // normaliza 3h pra mm/h e pega o maior
  const r3perH = r3 ? (r3 / 3) : 0;
  return Math.max(r1, r3perH);
}

function isHeavyRain(city) {
  const r1 = city?.rain?.['1h'] ?? 0;
  const r3 = city?.rain?.['3h'] ?? 0;
  const wid = city?.weather?.[0]?.id;

  const heavyByVolume = (r1 >= HEAVY_RAIN_1H_MM) || (r3 >= HEAVY_RAIN_3H_MM);
  const heavyByCode = [502, 503, 504, 522].includes(wid);

  return heavyByVolume || heavyByCode;
}

function scoreCity(city, streaksById) {
  const intensity = getIntensityMMperH(city);
  const streak = Number(streaksById[String(city.id)] ?? 0);
  const wid = city?.weather?.[0]?.id;

  const heavyCodeBonus = [502, 503, 504, 522].includes(wid) ? 2 : 0;

  return (intensity * INTENSITY_WEIGHT) + (streak * STREAK_WEIGHT) + heavyCodeBonus;
}

function trimStreaks(streaksById) {
  const entries = Object.entries(streaksById)
    .map(([id, streak]) => [id, Number(streak) || 0])
    .filter(([, streak]) => streak > 0);

  // mantém os maiores streaks
  entries.sort((a, b) => b[1] - a[1]);

  const trimmed = {};
  for (const [id, streak] of entries.slice(0, MAX_STREAK_ENTRIES)) {
    trimmed[id] = streak;
  }
  return trimmed;
}

async function checkWeather() {
  console.log(`Monitorando ${CITY_IDS.length} cidades`);

  const shopId = await getShopId();
  if (!shopId) return;

  // --- NOVO: carrega streaks persistentes ---
  let streaksById = await getRainStreaks();

  // Busca todas em paralelo
  const promises = CITY_IDS.map(id => getCityWeather(id));
  const results = await Promise.all(promises);

  // Atualiza streaks + filtra cidades chovendo
  const rainingCities = results
    .filter(Boolean)
    .filter(city => {
      const raining = isRainingNow(city);
      const key = String(city.id);
      const prev = Number(streaksById[key] ?? 0);
      streaksById[key] = raining ? (prev + 1) : 0;
      return raining;
    });

  console.log(`Encontradas ${rainingCities.length} cidades com chuva.`);

  // Rank por score (força + duração)
  const ranked = rainingCities
    .map(city => {
      const score = scoreCity(city, streaksById);
      const r1 = city?.rain?.['1h'] ?? 0;
      const r3 = city?.rain?.['3h'] ?? 0;
      const wid = city?.weather?.[0]?.id;
      const streak = Number(streaksById[String(city.id)] ?? 0);

      return { city, score, r1, r3, wid, streak, heavy: isHeavyRain(city) };
    })
    .sort((a, b) => b.score - a.score);

  // --- NOVO: loga quais estão com chuva forte ---
  const heavyList = ranked.filter(x => x.heavy);
  if (heavyList.length > 0) {
    console.log(
      `CHUVA FORTE (${heavyList.length}): ` +
      heavyList
        .slice(0, 10)
        .map(x => `${x.city.name}[${x.city.id}] (1h:${x.r1}mm 3h:${x.r3}mm streak:${x.streak} wid:${x.wid} score:${x.score.toFixed(1)})`)
        .join(' | ')
    );
  } else {
    console.log(`Nenhuma cidade com chuva forte (pelos thresholds atuais).`);
  }

  // Log do top
  if (ranked.length > 0) {
    console.log(
      `TOP 5: ` +
      ranked.slice(0, 5).map(x =>
        `${x.city.name}[${x.city.id}] (1h:${x.r1}mm 3h:${x.r3}mm streak:${x.streak} score:${x.score.toFixed(1)})`
      ).join(' | ')
    );
  }

  // --- NOVO: salva streaks persistentes (trimado) ---
  streaksById = trimStreaks(streaksById);
  await setRainStreaks(shopId, streaksById);

  // Lógica de Memória original (mantém se ainda chove)
  const currentCityOnSite = await getCurrentShopifyCity();

  if (ranked.length > 0) {
    let chosenCity;

    // Mantém a atual se ainda estiver chovendo
    const stillRainingInCurrent = ranked.find(x => x.city.name === currentCityOnSite);

    if (stillRainingInCurrent) {
      console.log(`-> A cidade atual (${currentCityOnSite}) continua chovendo. Mantendo-a.`);
      chosenCity = stillRainingInCurrent.city;
    } else {
      // Prioriza a mais forte/mais duradoura (score maior)
      chosenCity = ranked[0].city;
      console.log(`\nNova cidade escolhida (maior prioridade): ${chosenCity.name} [${chosenCity.id}]`);
    }

    await updateShopifyMetafield(chosenCity.name);
  } else {
    console.log("\nSol nas cidades -> Limpando aviso.");
    await updateShopifyMetafield(null);
  }
}

checkWeather();
