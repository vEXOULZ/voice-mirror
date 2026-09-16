// Português do Brasil. Every key the page uses: the h.* keys are the fixed
// text in index.html, rp.h.* the fixed text in reference.html, and the rest
// match js/lang/en.js one for one.

export default {
  // --- index.html ---------------------------------------------------------
  "h.title": "Espelho de voz",
  "h.description": "Um espelho para a sua voz no navegador: tom, brilho e vogal, ao vivo, sem nada sair do seu computador.",
  "h.language": "Idioma",
  "h.theme": "Tema",
  "h.light": "Claro",
  "h.lightTheme": "Tema claro",
  "h.system": "Seguir o sistema",
  "h.systemTheme": "Seguir o tema do sistema",
  "h.dark": "Escuro",
  "h.darkTheme": "Tema escuro",
  "h.settings": "Configurações",
  "h.done": "Pronto",
  "h.show": "Mostrar",
  "h.bands": "Faixas de tom",
  "h.bandsAbout": "Sobre as faixas de tom",
  "h.bandsInfo": `<p>As faixas com que o painel de tom compara o seu tempo com voz, cada uma por conta
    própria. As faixas podem se sobrepor, então as proporções podem somar mais de 100%. Desmarque Sombrear para
    tirar uma faixa do traçado sem deixar de contá-la, e marque a opção abaixo para ver também o tempo
    fora de todas.</p>
    <p>São uma referência, não uma meta. Se quem acompanha você na fonoaudiologia usa outras, use as dessa pessoa. As mudanças
    valem enquanto você digita, e a sessão inteira é recontada com as novas faixas.</p>`,
  "h.showOutside": "Mostrar o tempo fora de todas as faixas",
  "h.bandAdd": "Adicionar faixa",
  "h.bandReset": "Voltar às faixas padrão",
  "h.ref": "Vogais de referência",
  "h.refAbout": "Sobre as vogais de referência",
  "h.refInfo": `<p>Os losangos no plano vocálico e as opções em Alvo. Carregue um arquivo JSON para usar
    os seus: os valores de quem acompanha você na fonoaudiologia, outro idioma ou suas próprias frases de treino.</p>
    <p>Ele é lido aqui e salvo neste navegador, nunca enviado. O formato está na
    <a href="reference.html">página de referências</a>, junto com os dois conjuntos incluídos para ler
    ou baixar como ponto de partida. Você também pode soltar o arquivo em qualquer lugar desta página.</p>`,
  "h.refLoad": "Carregar referência",
  "h.refReset": "Voltar à referência padrão",
  "h.refView": "Ver as referências incluídas",
  "h.these": "Estas configurações",
  "h.theseAbout": "Onde as configurações ficam guardadas",
  "h.theseInfo": `<p>Tudo acima fica neste navegador e em nenhum outro lugar. Não acompanha você em outro
    computador, e limpar os dados do site apaga tudo. Exportar é como levar para outro lugar e como
    guardar uma cópia. Nada sobre a sua voz vai junto.</p>`,
  "h.export": "Exportar configurações",
  "h.import": "Importar configurações",
  "h.resetAll": "Redefinir tudo",
  "h.sub": "O seu tom e a sua vogal, enquanto você fala. Tudo fica neste navegador: sem envio, sem conta, sem servidor.",
  "h.insecure": "Esta página não está em uma origem segura, então o navegador não vai liberar o microfone. Abra por https ou por localhost.",
  "h.takes": "Gravações",
  "h.session": "Sessão",
  "h.keep": "Guardar últimos 30s",
  "h.cal": "Calibrar",
  "h.reset": "Zerar",
  "h.controlsAbout": "O que estes botões fazem",
  "h.controlsInfo": `<p><b>Iniciar</b> abre o microfone e começa a mostrar a sua voz. <b>Parar</b> fecha de novo.</p>
    <p><b>Gravar</b> captura uma gravação que você pode baixar, em WAV sem perda ou num arquivo comprimido menor.</p>
    <p><b>Guardar últimos 30s</b> transforma os últimos trinta segundos que o microfone ouviu em uma
    gravação, mesmo com Gravar desligado. Funciona até depois de Parar, então uma frase que você só
    percebeu que ficou boa depois não se perde. Só em WAV.</p>
    <p><b>Reproduzir</b> passa a gravação ou o arquivo carregado pela mesma análise, então tudo se move
    como ao vivo, sem o som da sala por cima.</p>
    <p><b>Calibrar</b> escuta a sua sala por alguns segundos, em silêncio, e define o volume a partir do
    qual um som conta como voz. Use se o traçado pegar ruído de fundo ou perder uma voz baixa.</p>
    <p><b>Zerar</b> limpa todos os números da tela. Gravações e arquivos carregados continuam.</p>`,
  "h.take": "Gravação",
  "h.format": "Formato para baixar",
  "h.wav": "WAV, sem perda",
  "h.webm": "Comprimido",
  "h.download": "Baixar",
  "h.playFile": "Tocar um arquivo",
  "h.fromDisk": "Escolher arquivo",
  "h.pitch": "Tom",
  "h.pitchAbout": "Sobre o painel de tom",
  "h.pitchInfo": `<p>A linha é o seu tom nos últimos dez segundos, numa escala em que cada oitava tem a
    mesma altura. Falhas são silêncio, ou uma consoante sem voz: a página deixa a falha em vez de
    adivinhar.</p>
    <p>As áreas sombreadas são faixas de referência, que você pode mudar em Configurações. Os medidores
    embaixo mostram quanto do seu tempo com voz nesta sessão ficou dentro de cada faixa. As faixas podem
    se sobrepor, então as proporções podem somar mais de 100%. Em Configurações dá para acrescentar um
    medidor para o tempo fora de todas elas.</p>`,
  "h.traceLabel": "O seu tom nos últimos dez segundos, contra as faixas de referência. O valor atual e a mediana aparecem em texto acima.",
  "h.formants": "Formantes",
  "h.formantsAbout": "Sobre o painel de formantes",
  "h.formantsInfo": `<p>As três primeiras ressonâncias do seu trato vocal, nos mesmos dez segundos do tom.
    F1 muda principalmente com a abertura da mandíbula, F2 com o quanto a língua está para a frente, e F3
    com o resto do trato.</p>
    <p>São estimativas brutas, quadro a quadro, então mostram o movimento entre vogais que o plano
    vocálico abaixo ignora de propósito. Falhas são trechos sem voz.</p>`,
  "h.formantsLabel": "F1, F2 e F3 nos últimos dez segundos. Os valores mais recentes e as medianas da sessão aparecem em texto.",
  "h.bright": "Brilho",
  "h.brightAbout": "Sobre o brilho",
  "h.brightInfo": `<p>O centroide espectral: o ponto de equilíbrio da energia da sua voz, em Hz. Um som
    mais brilhante e para a frente move para a direita; um mais escuro move para a esquerda. É o que os
    exercícios de ressonância mudam, e o traçado do tom não diz nada sobre isso.</p>
    <p>Não há faixa-alvo aqui, porque nenhuma foi publicada. Observe para que lado ele se move.</p>`,
  "h.intone": "Variação da entonação",
  "h.intoneAbout": "Sobre a variação da entonação",
  "h.intoneInfo": `<p>O quanto o seu tom varia, em semitons, nos últimos dez segundos. O número da sessão
    fica ao lado. Uma fala monótona soa masculina, seja qual for a altura.</p>`,
  "h.semitones": "semitons",
  "h.vtl": "Comprimento do trato vocal",
  "h.vtlAbout": "Sobre o comprimento do trato vocal",
  "h.vtlInfo": `<p>Estimado pelo espaçamento entre F1 e F3, só em vogais sustentadas. Diminui quando a
    laringe sobe. É um índice para acompanhar mudanças, não uma medida anatômica.</p>`,
  "h.plane": "Plano vocálico",
  "h.planeAbout": "Como ler o plano vocálico",
  "h.planeInfo": `<p>Leia como uma boca virada para a esquerda: para cima é a língua mais alta, para a
    esquerda é a língua mais à frente. O ponto verde é a última vogal que você sustentou. Fica sólido
    quando a vogal se firma, e fraco em consoantes e transições.</p>
    <p>Os losangos são médias publicadas de mulheres (rosa) e homens (azul) dizendo palavras isoladas.
    A fala corrida fica dentro deles mesmo quando nada na voz é diferente, então leia a posição e a
    dispersão, não a distância até um losango.</p>
    <p>Escolha um Alvo para ver a que distância você está dos dois pontos de referência daquela vogal, e
    para que lado se mover. Nenhum dos dois é uma meta escolhida pela página.</p>
    <p><b>Vogal de teste</b>: marque a opção e clique em qualquer lugar do plano para ouvir uma vogal
    sintética com F1 e F2 naquele ponto, no tom indicado ao lado. F3 e acima são posicionados
    automaticamente. Ela passa pela mesma análise de uma gravação, então o ponto deve cair na mira, o
    que serve para conferir a página e para ouvir como soa uma posição. Onde F2 fica abaixo de F1 ou
    muito perto dele não existe vogal real, e o ponto pode não acompanhar.</p>`,
  "h.reference": "Referência",
  "h.toneOn": "Vogal de teste",
  "h.toneHint": "Clique no plano para ouvir.",
  "h.tonePitch": "Tom",
  "h.toneAgain": "Tocar de novo",
  "h.target": "Alvo",
  "h.planeLabel": "Plano vocálico: a sua última vogal sustentada contra as vogais de referência. As distâncias até o alvo escolhido aparecem em texto abaixo.",
  "h.say": "Diga",
  "h.next": "Próxima",
  "h.about": "O que é isto",
  "h.aboutText": `<p><strong>Um espelho, não uma medição.</strong> Aperte Iniciar e ele mostra o seu tom e a
    sua vogal enquanto você fala. O <span class="i-inline">i</span> de cada painel explica como ler.</p>
    <p><strong>Os números não são uma medição de você.</strong> A análise roda sobre 85 milissegundos de
    som por vez, num navegador, com algoritmos diferentes dos usados numa clínica. Leia como uma
    direção, nunca como um valor, e nunca contra um limite.</p>
    <p><strong>Nada sai deste navegador.</strong> Sem envio, sem estatísticas, sem conta, sem servidor. O
    microfone é liberado quando você aperta Parar ou fecha a aba, e todos os números da tela vão
    junto. Uma gravação só existe até você baixar ou sair.</p>`,
  "h.licence": `Software livre sob a <a href="LICENSE">GNU AGPL v3 ou posterior</a>. A página inteira é o
    código-fonte: nada roda em outro lugar além daqui.`,

  // --- what the scripts write ---------------------------------------------
  "btn.start": "Iniciar",
  "btn.stop": "Parar",
  "btn.record": "Gravar",
  "btn.stopRecording": "Parar gravação",
  "btn.playBack": "Reproduzir",
  "btn.stopPlayback": "Parar reprodução",

  "panel.pitch": "Tom",
  "panel.formants": "Formantes",
  "panel.bright": "Brilho",
  "panel.intone": "Entonação",
  "panel.vtl": "Trato vocal",
  "panel.plane": "Plano vocálico",
  "panel.say": "Frases",

  "share.outside": "Fora de todas as faixas",

  "band.name": "Nome",
  "band.to": "a",
  "band.remove": "Remover",
  "band.colour": "Desenhada translúcida, para ficar atrás do traçado.",
  "band.shade": "Sombrear",
  "band.shadeTitle": "Sombrear esta faixa no traçado do tom. Ela é contada de qualquer forma.",

  "read.median": "mediana {hz} Hz em {secs}s com voz",
  "read.medians": "medianas {values} Hz",
  "read.below": ", abaixo da barra",
  "read.above": ", acima da barra",
  "read.brightMedian": "mediana {hz} Hz",
  "read.session": "sessão {sd} ST",
  "read.vtlMedian": "mediana {cm} cm em {n} vogais",

  "take.none": "nada gravado ainda",
  "take.ready": "gravação pronta{secs}: {formats}",
  "take.and": " e ",
  "take.wav": "WAV",
  "take.compressed": "comprimido",
  "take.capped": "  (a cópia sem perda parou no limite)",
  "clip.none": "nenhum arquivo carregado",
  "clip.loaded": "carregado: {name}",
  "clip.justRecorded": "a gravação que acabou de ser feita",
  "clip.lastSeconds": "os últimos {secs} segundos",
  "clip.tone": "uma vogal de teste, F1 {f1} F2 {f2} Hz a {f0} Hz",

  "ref.none": "Nenhum",
  "ref.using": "usando {name}",
  "ref.usingCustom": "uma referência própria",
  "ref.usingShipped": "usando a referência padrão",
  "src.reference": "Referência: {name}.",
  "src.bandsOwn": "Faixas de tom: as suas, definidas em Configurações.",
  "src.bands": "Faixas de tom: {text}",

  "hint.noTargetDot": "Nenhum alvo escolhido. O ponto é a última vogal que você sustentou.",
  "hint.noTarget": "Nenhum alvo escolhido. Sustente uma vogal e o ponto aparece.",
  "hint.sustain": "Sustente uma vogal. O ponto se move em vogais sustentadas, não em transições.",
  "hint.open": "abra a mandíbula ou abaixe a língua",
  "hint.close": "feche a mandíbula ou suba a língua",
  "hint.forward": "língua para a frente ou lábios menos arredondados",
  "hint.back": "língua para trás ou lábios mais arredondados",
  "hint.onTarget": "no alvo",
  "hint.men": "homens",
  "hint.women": "mulheres",
  "hint.you": "você",
  "hint.notSteady": "   (ainda não estável)",

  "plane.f2": "F2 em Hz: língua à frente ou atrás",
  "plane.f1": "F1 em Hz: língua alta ou baixa",

  "status.ready": "Pronto. Aperte Iniciar e permita o microfone.",
  "status.noSave": "Este navegador não salvou as configurações, então elas duram até a aba fechar.",
  "status.bandsReset": "Faixas de tom de volta ao padrão.",
  "status.refLoaded": "Referência carregada de {name}{dropped}. Salva neste navegador, não enviada.",
  "status.refDropped": ". {n} linha(s) inutilizável(is) descartada(s): {rows}",
  "status.refFailed": "Não foi possível usar {name}: {error} Mantendo o que estava carregado.",
  "status.refReset": "De volta à referência padrão.",
  "status.savedRefFailed": "A referência salva não pôde ser usada: {error} Usando a padrão.",
  "status.exported": "Configurações exportadas. Nada sobre a sua voz está nesse arquivo.",
  "status.imported": "Configurações importadas de {name}.",
  "status.importFailed": "Não foi possível importar {name}: {error}",
  "status.resetConfirm": "Esquecer tema, idioma, painéis, faixas de tom e referência neste navegador?",
  "status.resetDone": "Configurações redefinidas. Da próxima vez, exporte antes se quiser recuperá-las.",
  "status.calNothing": "A calibração não ouviu nada. Limiar sem mudança.",
  "status.calDone": "Sala medida em {room}. Limiar definido em {gate}{clamped}. O padrão é {def}.",
  "status.calClamped": " (limitado)",
  "status.calibrating": "Calibrando. Fique em silêncio por {secs} segundos.",
  "status.calCancelled": "Calibração cancelada.",
  "status.recording": "Gravando {time}",
  "status.micStopped": "Microfone parado.",
  "status.micStoppedClip": "Microfone parado. {name} continua carregado.",
  "status.micRefused": "Microfone recusado: {error}",
  "status.listening": "Ouvindo a {rate} Hz",
  "status.listeningNote": "Ouvindo a {rate} Hz. Observação: {notes}.",
  "status.noRecord": "este navegador não grava, então Gravar está desligado",
  "status.noTap": "este navegador não oferece memória de retorno, então Guardar últimos 30s está desligado",
  "status.takeReady": "Gravação pronta. Baixe ou grave por cima.",
  "status.takeEmpty": "Essa gravação não produziu nada.",
  "status.nothingHeard": "Nada ouvido ainda.",
  "status.kept": "Últimos {secs} segundos guardados em WAV sem perda.",
  "status.playStopped": "Reprodução parada.",
  "status.playDone": "Reprodução terminada.",
  "status.decodeFailed": "Não foi possível decodificar {name}: {error}",
  "status.playing": "Reproduzindo {name} pela mesma análise, {secs}s",
  "status.tone": "Vogal de teste: F1 {f1}, F2 {f2}, F3 {f3} Hz, tom {f0} Hz.",
  "status.cleared": "Medições zeradas.",
  "status.clearedListening": "Medições zeradas. Ainda ouvindo.",
  "status.downloaded": "Baixado: {name}",
  "status.noFormat": "Essa gravação não tem arquivo nesse formato.",
  "status.loaded": "{name} carregado. Aperte Reproduzir.",
  "status.readFailed": "Não foi possível ler esse arquivo: {error}",
  "status.shippedFailed": "Não foi possível carregar os dados de referência: {error} A página continua funcionando, mas sem as faixas e os losangos.",

  "err.notJson": "esse arquivo não é JSON: {error}",
  "err.notObject": "esse arquivo não é um objeto JSON.",
  "err.nothingUsable": "nenhum pitch_bands nem vowel_reference utilizável nesse arquivo.",
  "err.status": "{url} respondeu {code}",
  "err.isReference": "isso parece um arquivo de referência, não de configurações. Use Carregar referência.",
  "err.noSettings": "nenhuma configuração nesse arquivo.",
  "err.noMic": "Este navegador não dá à página acesso ao microfone.",

  // --- reference.html -----------------------------------------------------
  "rp.h.title": "Arquivos de referência",
  "rp.h.description": "Os arquivos de referência de onde o Espelho de voz tira as faixas de tom e os losangos das vogais: o formato e os conjuntos incluídos para ler ou baixar.",
  "rp.h.back": "Voltar ao Espelho de voz",
  "rp.h.sub": "De onde vêm as faixas de tom e os losangos das vogais. Leia aqui os dois conjuntos incluídos, ou baixe um como ponto de partida para o seu e carregue em Configurações.",
  "rp.h.sets": "Referências incluídas",
  "rp.h.format": "O formato do arquivo",
  "rp.h.loading": "Carregando…",
  "rp.vowels": "{n} vogais",
  "rp.download": "Baixar {file}",
  "rp.downloadBoth": "Baixar as duas, como reference.json",
  "rp.showJson": "Mostrar o JSON",
  "rp.bands": "Faixas de tom",
  "rp.inBoth": "nos dois arquivos",
  "rp.fileName": "Referência incluída, {lang}",
  "rp.col.vowel": "Vogal",
  "rp.col.word": "Palavra",
  "rp.col.mf1": "Homens F1",
  "rp.col.mf2": "Homens F2",
  "rp.col.wf1": "Mulheres F1",
  "rp.col.wf2": "Mulheres F2",
  "rp.col.band": "Faixa",
  "rp.col.low": "Mínimo",
  "rp.col.high": "Máximo",
  "rp.failed": "Não foi possível carregar isto: {error}",
  "rp.md": "data/reference.pt.md",

  // --- words that arrive in the shipped data file -------------------------
  data: {
    "Typical male": "Masculino típico",
    "Typical female": "Feminino típico",
    "Very low": "Muito grave",
    "Male": "Masculino",
    "Androgynous": "Andrógino",
    "Female": "Feminino",
    "Very high": "Muito agudo",
    "Portuguese (Brazil)": "Português (Brasil)",
    "English (US)": "Inglês (EUA)",
    "Shipped reference": "Referência padrão",
    "Typical male and female speaking ranges as drawn by the voice-training apps in common clinical use, with the gap between them and the two ends named as bands of their own. Not taken from a paper: a practical reference for placing a reading at a glance, not a published norm. Set your own in Settings.":
      "Faixas típicas de fala masculina e feminina, como desenhadas pelos aplicativos de treino de voz de uso clínico comum, com o intervalo entre elas e as duas pontas como faixas próprias. Não vêm de um artigo: são uma referência prática para situar uma leitura de relance, não uma norma publicada. Defina as suas em Configurações."
  }
};
