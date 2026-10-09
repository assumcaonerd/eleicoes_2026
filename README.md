# Votos por Seção | Eleições 2026

Aplicativo MCP para ChatGPT dedicado **exclusivamente às Eleições Gerais de 2026**, com consulta factual de votos por candidato, município, bairro, zona, local de votação e seção eleitoral.

## Objetivo

A aplicação baixa e normaliza dados públicos da Justiça Eleitoral em uma base PostgreSQL própria. Depois da importação, as consultas do usuário são respondidas pelo banco local, sem depender de chamadas ao portal Resultados do TSE a cada busca.

## Escopo 2026

- Presidente: eleição 6257
- Governador, Senador, Deputado Federal e Deputado Estadual/Distrital: eleição 6259
- 1º turno: 04/10/2026
- Ciclo de divulgação: `ele2026`

Os identificadores acima devem ser conferidos com o arquivo oficial `ele-c.json` antes de cada importação em produção.

## Fontes oficiais

- `https://resultados.tse.jus.br/oficial/comum/config/ele-c.json`
- Arquivos EA12 de municípios
- Arquivos EA20 de resultado unificado para abrangência nacional, estadual, municipal e por zona
- Base oficial de votação por seção, quando disponibilizada em formato tabular, importada pelo script `import-sections-csv.ts`
- Dados de locais de votação podem ser incorporados à tabela `places` para derivar bairro e local de votação da seção

## Arquitetura

```text
TSE 2026 -> downloader -> data/raw -> normalizador -> PostgreSQL
                                                -> MCP /mcp -> ChatGPT
                                                -> widget Votos por Seção
```

## Desenvolvimento

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npm run db:init
npm run import:2026
npm run dev
```

Servidor MCP: `http://localhost:8787/mcp`  
Health check: `http://localhost:8787/health`

## Importação por seção

O resultado unificado de divulgação (EA20) cobre resultado agregado e resultado por zona. O detalhe candidato x seção deve ser carregado de uma fonte oficial que possua esse grão. Quando o TSE disponibilizar o arquivo tabular de votação por seção 2026, use:

```bash
npm run import:sections -- ./data/import/votacao_secao_2026.csv
```

O importador reconhece os nomes de colunas usuais do TSE e grava cada linha como `source_kind='tse_section_csv'`.

## Bairro

Bairro não é uma dimensão do voto em si. Ele é associado ao local de votação da seção. A modelagem separa `places` de `vote_facts`, permitindo vincular seção -> local -> endereço -> bairro sem alterar o dado eleitoral original.

## Ferramentas MCP

- `buscar_candidato`
- `resumo_candidato`
- `votos_detalhados`

`votos_detalhados` aceita os níveis `municipality`, `neighborhood`, `zone`, `polling_place` e `section`.

## ChatGPT

Depois de implantar este servidor em HTTPS, conecte a URL pública terminada em `/mcp` no modo de desenvolvedor do ChatGPT. O servidor expõe uma interface visual simples via MCP Apps e também funciona apenas por ferramentas estruturadas.

## Integridade

A pasta `data/raw` guarda cópias dos JSON baixados para auditoria. Em produção, mantenha essa pasta em armazenamento persistente e registre cada execução em `import_runs`.

## Aviso

Projeto independente, sem vínculo institucional com o Tribunal Superior Eleitoral. A fonte original dos dados é a Justiça Eleitoral. O aplicativo apresenta dados factuais e não realiza projeções, recomendações ou inferências eleitorais.

## Relatório cartográfico ES (A2)

Na aba Mapa, um candidato do ES sem filtros territoriais disponibiliza PNG A2
(4961 × 7016 px, 300 dpi) e SVG vetorial (420 × 594 mm), gerados no servidor
sem capturas do mapa ou dependência do zoom/tipo de mapa.

A malha oficial do IBGE e o cruzamento TSE/IBGE estão versionados em
`src/web/cartography/`, com fontes e data de obtenção em `provenance.json`.
Os 78 municípios têm contornos, nomes, votos, cores por quartis dos valores
positivos, tabela alfabética e painel executivo. As ilhas oceânicas de Vitória
estão preservadas em um quadro com escala própria. Os glifos Lato (OFL) são
vetoriais, para não depender de fontes instaladas na impressão.

A exportação consulta apenas `tse_municipality` e `tse_scope`, com o mesmo
candidato, eleição, cargo, UF e turno, em uma transação de leitura com snapshot
repetível. Não soma seções, zonas ou locais por cima dos resultados municipais.
Exige 78 registros municipais explícitos e um total estadual único: registro
faltante é erro, nunca zero. Duplicação, código desconhecido ou soma divergente
bloqueiam a exportação. Pinos são contexto opcional e não entram nos totais.

`npm run test:map` valida geometria, códigos, zeros explícitos, dados faltantes,
duplicação, divergência, classificação, rótulos sem colisão e dimensões/dpi.
Gera arquivos **sintéticos**, claramente identificados, em
`/tmp/siga-map-validation/`; CI também os guarda como artefato. Esses testes
não substituem uma exportação real autenticada nem o teste de produção.
