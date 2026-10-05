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
