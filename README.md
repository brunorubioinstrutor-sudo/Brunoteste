# RD Station Leads Server

Backend mínimo que faz a ponte entre o **Painel de Gerenciamento de Vendas**
(arquivo `painel_vendas_por_diretoria.html`) e a **API da RD Station CRM**,
agregando os leads por Time e por Diretoria.

## Por que um backend?

O painel é um arquivo que roda no navegador. Se o token de acesso da RD
Station fosse colocado diretamente no código desse arquivo, qualquer pessoa
que abrisse a página teria acesso total à sua conta RD Station (negociações,
contatos, etc.).

Este servidor resolve isso: o token fica **apenas** em uma variável de
ambiente no servidor, e o painel chama um endpoint próprio
(`/api/leads?inicio=...&fim=...`), sem nunca ver o token.

## Como rodar

1. Tenha o Node.js 18 ou mais recente instalado.
2. Instale as dependências:
   ```
   npm install
   ```
3. Copie `.env.example` para `.env` e preencha:
   - `RD_CRM_TOKEN`: token da sua conta RD Station CRM (em **RD Station CRM
     > Configurações > Tokens de API**)
   - `RD_OWNER_FIELD_PATH`: campo onde está o nome do responsável da
     negociação na resposta da API (veja "Confirme os filtros da API" abaixo)
4. Inicie o servidor:
   ```
   npm start
   ```
   Por padrão ele roda em `http://localhost:3001`.

## Endpoint disponível

```
GET /api/leads?inicio=AAAA-MM-DD&fim=AAAA-MM-DD
```

Resposta:
```json
{
  "inicio": "2026-06-01",
  "fim": "2026-06-15",
  "total_leads": 612,
  "sem_mapeamento": 3,
  "por_time": {
    "Larissa Mendes": 41,
    "Pedro Carvalho": 38,
    "Joao Cossenzo": 22
  },
  "por_diretoria": {
    "Larissa Mendes": 187,
    "Pedro Carvalho": 201,
    "Rodrigo Oliveira": 156
  }
}
```

- `por_time`: contagem de leads por responsável (nome igual ao usado em
  `team-mapping.json`)
- `por_diretoria`: soma de `por_time` agrupada por diretoria
- `sem_mapeamento`: quantidade de leads cujo responsável não foi encontrado
  em `team-mapping.json` (útil para detectar nomes divergentes)

## Conectar o painel a este servidor

No arquivo `painel_vendas_por_diretoria.html`, dentro da tag `<script>`,
altere a constante:

```js
var RD_API_BASE = '';
```

para apontar para o seu servidor, por exemplo:

```js
var RD_API_BASE = 'http://localhost:3001';
```

Com isso, ao selecionar um período no calendário, o painel busca os números
reais e atualiza:
- cada linha de time (usando o atributo `data-owner`, que contém o nome do
  responsável)
- o total de cada card de diretoria (usando o atributo `data-diretoria`)
- o total geral no topo do painel

Se a chamada falhar (ex: servidor não estiver rodando), o painel volta para a
**estimativa local** baseada nos números já exibidos — nada quebra.

## team-mapping.json

Contém a relação Time → Diretoria usada para agregar os resultados. A chave
de cada entrada deve ser **exatamente o nome do responsável (owner) como
aparece na RD Station**, pois é esse nome que será comparado com o campo
configurado em `RD_OWNER_FIELD_PATH`.

```json
{
  "Larissa Mendes":   { "time": "Time - Larissa Mendes",   "diretoria": "Larissa Mendes" },
  "Joao Cossenzo":    { "time": "Time - Joao Cossenzo",    "diretoria": "Rodrigo Oliveira" },
  "Vanessa Ramos":    { "time": "Vanessa Ramos",           "diretoria": "Rodrigo Oliveira" }
}
```

Se algum nome na RD Station tiver grafia diferente da usada aqui (acentos,
abreviações, etc.), os leads dessa pessoa cairão em `sem_mapeamento` — ajuste
o arquivo até esse número zerar.

## Importante: confirme os filtros da API

A documentação pública da RD Station não deixa explícito:

1. Os nomes exatos dos parâmetros de filtro por data e paginação do endpoint
   `GET /deals` ("Listar negociações"). Os usados aqui são `start_date`,
   `end_date`, `date_field=created_at`, `page`, `limit`, com verificação de
   próxima página via `has_more`/`next_page`.
2. O campo exato onde fica o nome do responsável pela negociação
   (`RD_OWNER_FIELD_PATH`, por padrão `user.name`).

Faça uma chamada de teste com seu próprio token (via `curl` ou no "Try It" da
documentação, em `developers.rdstation.com`, seção "Negociações"), confira o
JSON de resposta e ajuste `server.js` / `.env` conforme necessário.
