# Estado da implementação

## Pronto

- Estrutura do aplicativo MCP para ChatGPT
- Widget de resultados
- PostgreSQL e índices de busca
- Busca por candidato/número/cargo/UF
- Consulta por município e zona
- Modelo de bairro, local e seção
- Downloader com persistência local dos arquivos do TSE
- Importador de CSV de votação por seção
- Docker e CI

## Dependência externa de dados

O detalhe candidato x seção depende do arquivo oficial de votação por seção 2026 ou da decodificação dos Boletins de Urna (BU). O código já possui a tabela e a ferramenta de consulta para esse nível; a carga tabular entra pelo script `import-sections-csv.ts`.
