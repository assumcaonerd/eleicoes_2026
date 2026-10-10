# Correções do painel majoritário, 10/10/2026

Entrega parcial. Não certifica o roteiro de produção nem a conclusão da plataforma.

## Alterações

- Interface passa a adotar candidato e UF devolvidos pelo servidor. Governador permanece na UF da candidatura; ação nacional e exterior validam o cargo.
- Rota de geometria valida o candidato e território antes de entregar a malha. CSV usa a UF validada no nome do arquivo.
- `hidden` prevalece sobre CSS dos botões. Removido restaurar visualização; retorno único ao mapa estadual disponível após município ou localização pessoal.
- Lista denominada municípios/UFs/unidades do exterior conforme recorte. Busca territorial removida do governador. Filtros, detalhes e comparações limpos ao mudar seleção.
- Pino pessoal azul circular separado dos pinos vermelhos eleitorais. Respostas antigas de geolocalização não alteram uma nova consulta. Coordenadas ausentes não são convertidas em zero.
- Exportador ES preservado e protegido por cargo/UF no painel. Outros estados não recebem promessa de exportação ES.
- Cartão estático substituído por consulta de totalizações territoriais armazenadas, com causa específica na ausência dos dados.
- Tabela `territorial_totals` independente de candidatos, com recorte, campos EA20, URL, arquivo, hash SHA256 e horário de ingestão. Migração aditiva no schema; nenhuma exclusão.
- `vote_facts.source_sha256` permite vincular votos e denominadores do mesmo arquivo. Registros antigos sem hash não recebem percentuais presumidos.
- Parser baseado na especificação oficial EA20 de 10/07/2026. Campos: `v.vv`, `v.vb`, `v.tvn` (inclui nulos técnicos), `e.c`, `e.a`, `s.pstn`, `and`, `tf`, `dt`, `ht`, `idg`. Valida fase oficial, divulgação autorizada e recorte.
- Importador EA20 existente grava totalizações em novas execuções. Script independente `scripts/import-territorial-totals.ts` importa indicadores sem modificar votos dos candidatos. Não foi executada carga em produção nesta sessão.
- CSV inclui coluna explícita de percentual dos válidos. Comparação exibe percentuais municipais e diferença em pontos percentuais apenas com origem vinculada.

## Arquivos

`src/majority/page.ts`, `src/ui/majority.js`, `src/web/handler.ts`, `src/majority/data.ts`, `src/majority/model.ts`, `src/majority/indicators.ts`, `src/db/schema.sql`, `src/tse/importer.ts`, `scripts/import-territorial-totals.ts`, `scripts/test-indicators.ts`, `scripts/test-majority.ts`, `package.json`, `.github/workflows/ci.yml` e este relatório.

## Evidências e limites

- Check TypeScript, build e testes majoritários, marca e mapa ES executados localmente.
- Catálogos: ES 78, SP 645, Brasil 27 UFs e 5.571 unidades municipais; exterior 186 unidades. Inventário não certifica votos importados.
- Testes eleitorais e de exportação são sintéticos identificados. Nenhum dado sintético foi gravado em produção.
- Navegador publicado retornou 502 com conexão recusada em duas tentativas. Railway informa implantação anterior SUCCESS e healthcheck aprovado. Não se conclui que a aplicação esteja indisponível para todos os usuários a partir desta falha do navegador.
- Logs de produção anteriores mostram timeouts/fetch failed nas consultas majoritárias. Nenhum acesso às credenciais do banco foi obtido nesta sessão.

## Pendências impeditivas da conclusão

- Executar carga oficial de indicadores e conferir valores reais, hashes e horários; percentuais de registros legados requerem ingestão conjunta validada, sem inventar denominadores.
- Importação e conciliação dos resultados do exterior, com associação oficial por país. Não foram atribuídos países inferidos.
- Exportação genérica de outros estados em SVG/PNG, composição legível para os 645 municípios de SP. Mantido somente exportador ES existente, sem renomeá-lo como nacional.
- Conferência de arquivos baixados com votos reais, com zoom municipal máximo, em aplicação autenticada.
- Testes autenticados de navegação, geolocalização concedida/negada, regressão real dos deputados, smartphone e conexão lenta.
- Histórico de falhas de atualização e cache último válido com aviso de falha identificado. Snapshot armazenado não representa consulta ao vivo.
- Percentuais presidenciais por UF e diferença percentual de totais no mesmo snapshot oficial.

Fonte de especificação: https://www.tse.jus.br/eleicoes/eleicoes-2026-content/arquivos/divulgacao-de-resultados/tse-ea20-arquivo-de-resultado-unificado
