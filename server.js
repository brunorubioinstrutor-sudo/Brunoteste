// Backend proxy para o Painel de Gerenciamento de Vendas.
//
// Objetivo: manter o token da RD Station CRM em segurança no servidor
// (variável de ambiente) e expor um endpoint que devolve, para um período
// informado, o total de leads (negociações) e a quebra por Time e por
// Diretoria, usando o mapeamento em team-mapping.json.
//
// NUNCA coloque o RD_CRM_TOKEN no código do front-end (HTML/JS que roda no
// navegador) — qualquer pessoa que abrir a página conseguiria copiá-lo e
// acessar sua conta da RD Station.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const RD_CRM_TOKEN = process.env.RD_CRM_TOKEN;
const RD_CRM_BASE = 'https://crm.rdstation.com/api/v1';

// Caminho dentro do objeto "deal" onde está o nome do responsável (owner).
// Ex: 'user.name' -> deal.user.name | 'owner.name' -> deal.owner.name
// Confirme o campo correto na sua conta (ver README) e ajuste via .env.
const OWNER_FIELD_PATH = process.env.RD_OWNER_FIELD_PATH || 'user.name';

const TEAM_MAPPING = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'team-mapping.json'), 'utf-8')
);

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));

if (!RD_CRM_TOKEN) {
  console.warn(
    '[aviso] RD_CRM_TOKEN não definido. Configure essa variável de ambiente ' +
    'com o token de acesso da sua conta RD Station CRM (Configurações > Tokens de API).'
  );
}

function getByPath(obj, pathStr) {
  return pathStr.split('.').reduce(function (acc, key) {
    return acc && acc[key] !== undefined ? acc[key] : undefined;
  }, obj);
}

// GET /api/leads?inicio=AAAA-MM-DD&fim=AAAA-MM-DD
// Retorna o total de negociações (leads) criadas no período informado,
// junto com a quebra por Time (por_time) e por Diretoria (por_diretoria).
app.get('/api/leads', async (req, res) => {
  const { inicio, fim } = req.query;

  if (!inicio || !fim) {
    return res.status(400).json({
      error: 'Informe os parâmetros "inicio" e "fim" no formato AAAA-MM-DD.',
    });
  }

  if (!RD_CRM_TOKEN) {
    return res.status(500).json({
      error: 'RD_CRM_TOKEN não configurado no servidor.',
    });
  }

  try {
    const allDeals = [];
    let page = 1;
    let hasNext = true;
    const MAX_PAGES = 50; // proteção contra contas muito grandes / loop infinito

    while (hasNext && page <= MAX_PAGES) {
      const url = new URL(`${RD_CRM_BASE}/deals`);
      url.searchParams.set('token', RD_CRM_TOKEN);

      // ───────────────────────────────────────────────────────────────
      // ATENÇÃO: confirme estes nomes de parâmetro na documentação
      // "Listar negociações" (crm-v1-list-deals) da RD Station, pois a
      // referência pública não deixou claro o nome exato dos filtros de
      // data e do campo usado para paginação. Ajuste aqui se necessário.
      // ───────────────────────────────────────────────────────────────
      url.searchParams.set('start_date', inicio);
      url.searchParams.set('end_date', fim);
      url.searchParams.set('date_field', 'created_at');
      url.searchParams.set('page', String(page));
      url.searchParams.set('limit', '200');

      const resp = await fetch(url.toString());

      if (!resp.ok) {
        const detail = await resp.text();
        return res.status(resp.status).json({
          error: 'Erro ao consultar a API da RD Station CRM.',
          detail,
        });
      }

      const data = await resp.json();

      // O formato exato da resposta pode variar (ex: { deals: [...] } ou
      // diretamente um array). Ajuste conforme o retorno real da sua conta.
      const deals = Array.isArray(data) ? data : data.deals || [];
      allDeals.push(...deals);

      hasNext = Boolean(data.has_more || data.next_page) && deals.length > 0;
      page += 1;
    }

    // Agrega por Time (nome do responsável) e por Diretoria, usando o
    // mapeamento configurado em team-mapping.json.
    const porTime = {};
    const porDiretoria = {};
    let semMapeamento = 0;

    allDeals.forEach((deal) => {
      const ownerName = getByPath(deal, OWNER_FIELD_PATH);
      const mapping = ownerName && TEAM_MAPPING[ownerName];

      if (!mapping) {
        semMapeamento += 1;
        return;
      }

      porTime[ownerName] = (porTime[ownerName] || 0) + 1;
      porDiretoria[mapping.diretoria] = (porDiretoria[mapping.diretoria] || 0) + 1;
    });

    res.json({
      inicio,
      fim,
      total_leads: allDeals.length,
      sem_mapeamento: semMapeamento,
      por_time: porTime,
      por_diretoria: porDiretoria,
    });
  } catch (err) {
    res.status(500).json({
      error: 'Falha ao consultar a RD Station CRM.',
      detail: err.message,
    });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
