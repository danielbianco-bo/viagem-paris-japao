# Paris → Japão · plano de captação

Conteúdos, referências, spots e checklists nas **18 datas de 26/10 a 12/11/2026**. A expansão usa o **Roteiro Japão 🇯🇵 (1).pdf**, enviado pelo Iagor em 24/10. Kyoto e Osaka são propostas apoiadas no PDF, com espaço para ajustes; horários editoriais não comprovam reservas.

## Conteúdo e roteiro

- 240 fotos originais e extras preservados, com análise de origem, alternativa e encaixe. Local identificado reconhece o cenário, sem comprovar a posição exata da câmera.
- 17 roteiros de vídeo no total: 3 de Paris e 14 na expansão, incluindo 5 opcionais. Há 71 takes distintos; um mesmo take pode atender a mais de um vídeo.
- Na seleção inicial, são 103 captações na viagem: 55 takes de vídeos ativos e 48 fotos. Referências arquivadas, imagens sem origem comprovada e vídeos opcionais inativos não viram tarefas obrigatórias.
- Shibuya Sky em 31/10, Disney em 02/11 e Nezu/Asakusa em 03/11, conforme o novo PDF. Drift é uma possibilidade em 01/11, dependente de horário compatível com teamLab e confirmação do operador; não há pin inventado em Daikoku.
- Kyoto e Osaka separados por data. O programa de chá/quimono em 04/11 é paralelo ao de café/Kennin-ji dos homens; o microvlog do chá começa opcional.
- Referências de Glico foram movidas de Shinjuku para Osaka; Super Nintendo World saiu de Disney para Universal; Yasaka saiu de Chureito/Asakusa para Kyoto. Origem incerta continua explicitamente incerta.

As descrições e frames originais do Daniel e os links enviados pelo Iagor são a base criativa. Formatos são adaptações ao roteiro e à participação real do grupo; áudio, disponibilidade do Reel e métricas atuais não são apresentados como dados confirmados. Fontes de lugares, acesso e regras ficam nas expansões de cada spot e em Mais → Pendências e notas.

## Paris em 27/10

A revisão anterior de 109 fotos, três Reels e 17 takes foi preservada. O ingresso de **16h40** foi confirmado diretamente pelo Iagor em 23/10. O PDF novo cita Torre às 16h00, uma galeria não identificada às 18h00 e jantar às 19h40. O conflito aparece na rota e nas pendências; esses novos blocos não foram encaixados como compromissos confirmados sobre a visita da Torre.

## Padrão de interface

Base: nota do Obsidian `Projetos/Spark/UX-UI — Aprendizados para o redesign.md`: imagens primeiro, títulos curtos, hierarquia e detalhes sob demanda.

- **Navegação:** Conteúdos / Fotos & spots / Rota. Referências, pendências e notas ficam em Mais. O seletor Datas permite pular direto entre os 18 dias.
- **Reel:** capa, título, formato/duração e locais. O roteiro abre no card; edição/áudio ficam num segundo nível. Vídeos de vários dias mostram a captação de hoje e o progresso do vídeo inteiro.
- **Opcional:** começa fora do progresso. Incluir na captação ativa os takes correspondentes em todos os dias daquele vídeo, preservando checks já feitos.
- **Spot:** fotos, janela do roteiro, certeza e uma frase. Posição da câmera, acesso, fontes e seleção completa abrem em Como captar. Referências usadas apenas como linguagem recebem identificação de estilo/local proposto.
- **Foto aberta:** nome do spot, nível de certeza e mapa. Fotos reclassificadas mostram o dia de destino e abrem o spot correto; alternativas não são chamadas de posição original comprovada.
- **Rota:** vídeos e fotos por parada, checks individuais ou Tudo captado, progresso do dia e Próxima pendência. Um take compartilhado aparece uma vez com os vídeos que atende. Notas e detalhes ficam recolhidos.

## Escolhas e armazenamento

Escolhas, fotos, takes, vídeos opcionais e notas ficam **neste navegador**, usando a mesma chave de armazenamento da revisão anterior. Não há sincronização automática entre aparelhos. Um check na rota atualiza os roteiros dos vídeos; mudar de dia não apaga o progresso. As datas com captura registrada recebem um indicador na navegação.

O progresso considera takes de vídeos ativos em spots da rota e fotos selecionadas desses spots. Tudo captado marca/desmarca esse conjunto, com estado parcial quando necessário. Cortar um spot altera os pontos de deslocamento e o conjunto de captação; os horários continuam precisando de revisão. Desvios selecionados não são encaixados automaticamente.

Mais → Pendências e notas permite exportar/importar o progresso **da viagem inteira**. O formato v3 inclui as fotos legadas lidas de `ck-done`; importações antigas v2 de Paris continuam aceitas e não apagam dias novos. IDs desconhecidos e formatos inválidos não são aplicados.

## Arquivos

- `assets/planner.js` e `assets/planner.css`: interface compartilhada por todas as datas.
- `data/paris-27.json`: revisão original de Paris.
- `data/viagem.json`: dias restantes, spots, curadoria de fotos, vídeos compartilhados, fontes e aliases das URLs antigas.
- `data/referencias.json`, `ck-*.json` e `arquivo.html`: fontes e imagens originais preservadas.
- `scripts/check-data.mjs`: integridade, cobertura dos originais, ligações de dia/spot/take e regressões de progresso.
- `scripts/check-storage.mjs`: exportação/importação, compatibilidade e preservação das marcações, isolando o DOM.

Ao editar um vídeo compartilhado, repetir um ID de take somente quando sua definição for idêntica. `dayId` e `spotId` definem onde ele entra na rota; o mesmo check alimenta todos os vídeos que o usam. `captureSpots` liga um take de deslocamento ao bloco de origem sem acrescentar visita.

## Conferência

Executar `node --check assets/planner.js`, `node scripts/check-data.mjs` e `node scripts/check-storage.mjs`.

Também foram conferidos no navegador: Conteúdos, Fotos & spots e Rota nas 18 datas; um take atualizando três roteiros sem triplicar o progresso; progresso persistindo após recarregar e ao trocar de dia; drift opcional entrando/saindo do total; conclusão/desfazer de bloco; arquivo de fotos reclassificadas abrindo o dia correto. Layout conferido em 390px.

Exportação/importação foram verificadas com execução isolada das rotinas reais. A confirmação automática de download pelo navegador embutido não ficou disponível; o teste não é tratado como download confirmado nesse navegador.

Site estático: servir a pasta por HTTP, por exemplo `python3 -m http.server 8765`, e abrir `http://localhost:8765/`. A publicação do GitHub Pages continua na `main`; o trabalho está no PR em rascunho para revisão antes de integrar.
