# Paris → Japão · plano de captação

Revisão progressiva do site da viagem. O primeiro dia trabalhado é **Paris, 27/10/2026**. Os demais dias preservam as referências do roteiro original e aparecem como **a revisar**.

## Revisão de Paris

- 109 fotos originais preservadas e triadas individualmente.
- Spots com posição de captura descrita, orientação de câmera, fontes, alternativa e nível de certeza.
- Três Reels propostos, com 17 takes ligados aos spots da rota.
- Sequência do dia, links de deslocamento e captações de cada parada, com checks individuais ou por bloco e progresso do dia.
- Torre Eiffel às **16h40** e jantar **após as fotos** confirmados pelo Iagor em 23/10/2026.
- Acesso ao Passage Richelieu, mesa/reserva do almoço, restaurante do jantar e hotel permanecem pendentes.

“Cenário identificado” reconhece a arquitetura visível; não comprova o ponto exato da câmera original. Pins usam lugares/endereço nomeados. Hipóteses e substituições não são apresentadas como geolocalização confirmada. Tempos de deslocamento são estimativas editoriais; não usam tráfego em tempo real.

## Padrão de interface

Base: nota do vault `Projetos/Spark/UX-UI — Aprendizados para o redesign.md`, em especial hierarquia visual, consistência e detalhes sob demanda. O uso na viagem inclui celular.

- **Entrada por Conteúdos:** cabeçalho curto, compromisso fixo e três abas principais: Conteúdos, Fotos & spots e Rota. Refs e pendências ficam em Mais.
- **Card de Reel:** imagem, título curto, formato/duração, região e botão Ver roteiro. Checklist e gancho abrem no card; edição e áudio ficam numa expansão adicional.
- **Card de spot:** fotos primeiro, horário, certeza da localização e uma frase sobre o que captar. Mapa visível; posição da câmera, acesso, seleção de fotos e fontes em Como captar.
- **Foto aberta:** imagem grande, nome curto do spot, certeza e ação no mapa. Análise completa e pasta original ficam em Ver localização e análise.
- **Rota:** horário, lugar, vídeos relacionados, quantidade de fotos e check Tudo captado visíveis. Ver captações abre os takes por vídeo e as fotos selecionadas, agrupados pelo spot real. Notas logísticas e esquema ficam recolhidos. O progresso separa takes e fotos; Próxima pendência leva ao primeiro bloco incompleto.
- **Preservar conteúdo:** resumos são campos de apresentação; análise, fontes, dados de captação e marcações continuam disponíveis. Não esconder incerteza ou compromisso fixo para reduzir texto.

O mesmo cabeçalho, navegação, galeria, card e expansão são usados nos outros dias, sem tratá-los como revisados. Para novos dias, preencher os campos curtos (`displayTitle`, `summary`, `displayTime`, `coverIds`, `placesLabel`) junto dos dados completos. O padrão não depende de texto exclusivo de Paris.

## Organização dos arquivos

- `index.html` e `assets/planner.*`: interface da revisão.
- `data/paris-27.json`: auditoria de cada foto, spots, Reels, rota e fontes de Paris.
- `data/referencias.json`: conteúdo original do site do Daniel.
- `ck-*.json`: imagens originais, preservadas.
- `arquivo.html`: site anterior completo para consulta.

Para preparar outro dia, revisar primeiro as imagens e suas localizações, depois ligar os takes e só então ordenar a logística. A revisão de Paris ainda é uma proposta; não marcar outro dia como revisado por herdar um local genérico.

## Escolhas e armazenamento

Prioridades, fotos escolhidas/captadas, takes gravados e anotações são salvos **somente no navegador atual**. A tela de decisões exporta/importa uma revisão para compartilhar essas escolhas. Não há sincronização entre aparelhos nem aprovação coletiva automática. Marcações de captura da versão anterior são lidas como referência; não são apagadas.

Os checks de Rota, Conteúdos e Fotos usam os mesmos registros. Tudo captado marca/desmarca apenas os takes e as fotos selecionadas daquele bloco; o estado parcial aparece no checkbox. O total do dia inclui somente takes dos spots ativos na rota e fotos selecionadas nesses spots, sem cobrar refs arquivadas ou desvios sem encaixe. Capturas em deslocamento usam `captureSpots` no bloco de origem (ex.: metrô após Palais-Royal); não criam uma visita extra.

Desvios marcados pelo usuário não entram automaticamente na rota base. A tela avisa que é preciso replanejar. Cortar um bloco atualiza os pontos dos links de deslocamento, mas os horários continuam editoriais e precisam ser revalidados.

## Prévia

Site estático, sem dependências de build. Servir a pasta via HTTP, por exemplo `python3 -m http.server 8765`, e abrir `http://localhost:8765/`.

## Validação desta revisão

- Sintaxe JavaScript conferida com Node.
- Integridade dos 109 IDs de foto e das ligações entre spots, refs, takes e rota.
- No navegador: navegação, filtro de incompatibilidades, detalhe de foto, ligação Reel → spot e persistência de checklist após recarregar.
- Na rota: 17 takes mapeados uma vez cada, check parcial/completo, conclusão e desfazer de bloco com fotos, total ajustado ao selecionar uma foto, persistência e vínculo com Conteúdos. Layout conferido também no celular.

Revisar o conteúdo por dia antes de integrar a branch à `main`, usada pelo GitHub Pages.
