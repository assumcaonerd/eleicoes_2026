# SIGA O VOTO: módulo de Governador e Presidente

Atualização incremental de 10/10/2026. Esta entrega é uma etapa funcional parcial do escopo solicitado. Não representa conclusão dos 18 critérios de aceitação.

## Diagnóstico e preservação

Aplicação existente: TypeScript, servidor HTTP/MCP, PostgreSQL central, bases granulares regionais e três bases para São Paulo, autenticação própria, assinatura e exportação ES em SVG/PNG A2. A identidade já utiliza fontes Lato locais, azul-marinho, amarelo e verde.

O módulo anterior permanece em `/app`. Foi adicionado um link para `/app/majority`. Não foram alteradas consultas, mapas, pinos, comparações ou exportações dos deputados. Não foram executadas importações de votos, exclusões, migrações ou substituições da base. O desenvolvimento reutiliza candidatos, vote_facts, section_votes, places, autenticação e malha ES.

## Implementado

* Painel separado para Governador e Presidente, com busca por cargo e UF e navegação sem recarga dentro do módulo.
* Catálogo oficial completo de 5.571 municípios e 27 UFs; governador restrito à sua UF; exterior separado, com 186 unidades eleitorais oficiais. Nomes de países não foram inferidos a partir das cidades do exterior.
* Total nacional oficial do candidato apresentado separadamente da consolidação municipal. Exterior nunca atribuído a uma UF brasileira.
* Consulta municipal usando apenas o grão `tse_municipality`. Uma UF incompleta aparece sem total, com contagem de registros presentes/esperados. Registros ausentes não viram zero. Zeros explícitos permanecem visíveis.
* Identidade presidencial reunida por eleição, turno, cargo, número e conferência do nome/identificador entre variantes de UF. Ambiguidade ou duplicidade bloqueiam a consulta.
* Leitura central em transação REPEATABLE READ, somente leitura. Conciliação estadual compara a soma municipal com o total estadual e sinaliza divergências. Não há conciliação nacional completa sem exterior completo.
* Mapa nacional oficial do IBGE armazenado no código e mapa municipal ES existente. Outras malhas estaduais são buscadas no IBGE com timeout, validação de tipo geométrico e cache em memória. Falhas cartográficas não impedem consultar a tabela.
* Lista territorial à esquerda: busca, ordenação alfabética, votos ascendentes/descendentes, participação no total do candidato e navegação por clique.
* Brasil → UF → município → zona/local → seção. As seções são consultadas por eleição e turno nas bases regionais; paginação de 500 registros; não se carregam todos os pontos nacionais. Sobreposição de seções entre shards bloqueia a consulta.
* Pinos vermelhos convencionais, ancorados na ponta, apenas para coordenadas cadastradas com valores numéricos dentro dos limites geográficos. A base de locais deriva da importação oficial existente; esta entrega não adiciona certificação geográfica ou geocodificação. Seções sem coordenadas continuam acessíveis em tabela.
* Ver Brasil, Ver estado, restaurar enquadramento, voltar ao município, geolocalização solicitada somente por clique e alternância padrão/satélite. Erros de localização e de imagens são explicitados.
* Comparação de dois candidatos da mesma eleição, cargo, turno e território, em uma única transação/snapshot: totais e diferenças absolutas territoriais. Percentuais de votos válidos indisponíveis continuam explicitamente indisponíveis.
* CSV completo do território independente da busca visual e do zoom. Inclui fonte temporal, cobertura, zero explícito e vazio para registro ausente; protege células contra fórmulas de planilha. Exportação bloqueada em divergência estadual.
* Reutilização da exportação SVG A2 completa do ES para governador. A geração segue os testes e a conciliação anteriores, independente do enquadramento do mapa.
* Layout responsivo com painel recolhível, navegação por teclado, foco visível e paleta Politique.

## Dados e fontes

Não foram criadas ou alteradas tabelas do banco. Os novos arquivos JSON contêm somente catálogos e geometrias, sem votos.

* EA12 municipal: https://resultados.tse.jus.br/oficial/ele2026/6259/config/mun-e006259-cm.json
* EA12 presidencial/exterior: https://resultados.tse.jus.br/oficial/ele2026/6257/config/mun-e006257-cm.json
* Malha nacional de navegação: https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF
* Malhas municipais adicionais: API oficial IBGE por código de UF, qualidade intermediária.
* Votos: registros EA20 e boletins de urna já importados pela aplicação. Não houve nova carga eleitoral.
* Proveniência ES: `src/web/cartography/provenance.json`. Proveniência nova: `src/majority/provenance.json`.
* Documentação de divulgação 2026: https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados

A malha nacional de qualidade mínima é destinada à navegação, não à impressão de grande formato. Horários exibidos são de importação, não confirmação de atualização da fonte oficial.

## Arquivos modificados/criados

* `src/majority/model.ts`: inventário de UFs, consolidação e CSV.
* `src/majority/data.ts`: consultas, snapshots, comparação e geometrias.
* `src/majority/page.ts`: página protegida.
* `src/majority/municipalities-2026.json`, `exterior-2026.json`, `br-ibge.json`, `provenance.json`: catálogos oficiais e proveniência.
* `src/ui/majority.js`: controles, listagens, mapas e detalhamento.
* `src/web/handler.ts`: rotas protegidas do novo módulo.
* `src/web/pages.ts`: link para o novo painel, preservando os controles anteriores.
* `src/tse/client.ts`: timeout HTTP de 30 segundos.
* `scripts/test-majority.ts`, `package.json`, `.github/workflows/ci.yml`: validação e execução em CI.
* Este relatório.

## Verificações realizadas

| Verificação | Resultado e limite |
|---|---|
| TypeScript (`npm run check`) | Passou |
| Build (`npm run build`) | Passou; JS e JSON presentes no produto compilado |
| Novo módulo (`npm run test:majority`) | Passou; validação matemática, inventários oficiais, integrações com fixtures somente em memória, comparação no mesmo snapshot, CSV e bloqueio de acesso sem autenticação |
| Marca e componentes anteriores (`npm run test:brand`) | Passou; 11 páginas, 7 abas e 50 controles preservados |
| Cartografia ES (`npm run test:map`) | Passou; 78 municípios/rótulos, 4961 × 7016 px, 300 DPI; dados sintéticos identificados, apenas nos artefatos de teste |
| Banco de produção com usuário autenticado | Não testado nesta sessão: conexão OAuth Railway não fornece valores das credenciais do banco |
| Navegador autenticado, zoom/pinos, geolocalização concedida/negada, mobile e conexão lenta | Não testados; código e estados revisados, sem declarar validação manual |
| Exportação com votos reais de governador e conciliação TSE em produção | Não testada nesta sessão |

Os testes não inserem votos sintéticos em produção. Testes matemáticos e de componentes não substituem o roteiro manual dos 15 testes solicitados.

## Pendências do escopo completo

1. Importação versionada dos indicadores oficiais de votos válidos, brancos, nulos, comparecimento, abstenção, seções totalizadas e status final/parcial. A tela mostra indisponibilidade, sem estimativas.
2. EA11/EA14/EA15/EA16/EA18, assinatura JWS quando aplicável, atualização automática, histórico de snapshots e monitoramento de conexão oficial. Não há apuração ao vivo nesta entrega. EA10 específico presidencial não deve ser presumido; deve-se seguir a documentação da eleição.
3. Histórico 2018/2022, segundo turno 2026 e correspondência territorial/cadastral entre eleições. O módulo rejeita recortes não validados.
4. Percentuais de votos válidos, diferenças em pontos percentuais, vencedores municipais entre todos os candidatos, mapas comparativos e evolução histórica.
5. Malhas municipais armazenadas/validadas para as demais UFs; nomes territoriais atualmente em tooltip/tabela, não todos como rótulos permanentes no mapa nacional.
6. Exterior por país e detalhamento granular: as 186 unidades estão catalogadas; votos dependem de registros já existentes. Não há associação automática de cidade a país.
7. Exportação nacional e de outras UFs, PDF vetorial, XLSX, A4/A3/A1/A0 e fila assíncrona de grandes arquivos. ES mantém os formatos anteriores A2; o novo acesso oferece SVG A2 para governador.
8. Painel administrativo adicional de ingestão/geolocalização/exportações e medições de carga, concorrência e performance em dispositivos reais.
9. Execução autenticada do roteiro funcional em produção. As consultas podem indicar base incompleta ou bloquear duplicidades existentes, em vez de alterar resultados para produzir uma tela aparentemente completa.

## Operação

Entrada: `/app/majority`, mediante login e assinatura ativa. Retorno ao painel anterior: `/app`. A publicação é realizada pelo serviço `siga-o-voto` existente, sem alterar domínio, audiência, configuração de importadores ou bancos.
