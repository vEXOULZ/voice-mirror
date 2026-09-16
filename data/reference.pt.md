# O arquivo de referência

O `reference.json` é de onde a página tira as faixas de tom, os losangos das vogais e a lista de alvos. **Carregar referência**, em Configurações, troca esse arquivo por um seu. O arquivo é lido no navegador e salvo no armazenamento desse navegador, então continua carregado da próxima vez. Ele nunca é enviado a lugar nenhum, e **Voltar à referência padrão** o esquece.

Carregue o seu quando quem acompanha você na fonoaudiologia trabalha com outras faixas, quando você quer vogais-alvo de um idioma que não está aqui, ou quando quer suas próprias frases de treino na tela.

## Estrutura

```json
{
  "name": "Como chamar este conjunto",
  "pitch_bands": [
    { "name": "Masculino", "low": 90, "high": 155, "color": "rgba(106, 159, 181, 0.14)" },
    { "name": "Andrógino", "low": 145, "high": 175, "color": "rgba(150, 150, 150, 0.14)", "shade": false },
    { "name": "Feminino", "low": 165, "high": 255, "color": "rgba(184, 84, 80, 0.13)" }
  ],
  "vowel_reference": [
    { "lang": "pt", "vowel": "i", "word": "i", "m_f1": 285, "m_f2": 2198, "w_f1": 307, "w_f2": 2676 }
  ],
  "languages": { "pt": "Como chamar este idioma no seletor" },
  "sentences": ["Algo para ler enquanto você observa o traçado."],
  "sources": { "pt": "De onde vieram estes números." }
}
```

Um arquivo precisa de pelo menos um entre `pitch_bands` e `vowel_reference`; todo o resto é opcional. Um arquivo só com `pitch_bands` mantém as vogais padrão; um só com `vowel_reference` mantém as faixas padrão. **Faixas que você editou em Configurações têm prioridade sobre as do arquivo**, então carregar uma referência nunca as desfaz sem avisar: volte as faixas ao padrão antes, se quiser as do arquivo.

As chaves continuam em inglês, porque são o que a página lê.

| Chave | O que faz |
|---|---|
| `pitch_bands` | As faixas com que o painel de tom compara o seu tempo com voz, um medidor para cada. Em Configurações dá para acrescentar um medidor para o tempo fora de todas. **Cada faixa é contada por conta própria**, então as faixas podem se sobrepor e as proporções podem somar mais de 100%. Cada uma tem `name`, `low` e `high` em Hz, e uma `color`, desenhada translúcida. `"shade": false` tira a faixa do traçado sem deixar de contá-la; se omitido, ela é sombreada. Qualquer número de faixas funciona. |
| `vowel_reference` | Os losangos no plano e as opções do seletor de Alvo. `m_` e `w_` são os dois conjuntos de referência (homens e mulheres), sempre desenhados juntos. Em Hz. |
| `languages` | Como o seletor de Referência chama cada `lang`, e de onde vem a linha de citação. Um `lang` sem entrada aqui mostra o próprio código. |
| `sentences` | Frases para ler enquanto observa. Aparecem uma de cada vez embaixo do traçado, e a página não vem com nenhuma. |
| `sources` | Texto livre por `lang`, e em `pitch_bands`, mostrado ao lado do seletor. |

## O que a página verifica

Um arquivo que não é JSON, ou cujas linhas de `vowel_reference` não têm `m_f1`, `m_f2`, `w_f1` ou `w_f2`, é recusado com uma mensagem dizendo qual linha. Uma linha cujos números não podem ser lidos é descartada e contada, em vez de desenhada no zero. **Nada volta ao padrão em silêncio**: se o que você carregou não pode ser desenhado, a página avisa e mantém o que tinha.

## O que vem incluído

Cinco faixas de tom: muito grave 60-80, masculino 80-140, andrógino 140-175, feminino 175-275 e muito agudo 275-500 Hz, com só a masculina e a feminina sombreadas no traçado. As faixas masculina e feminina são as típicas que os aplicativos de treino de voz desenham, uma referência prática e não uma norma publicada, e as outras três nomeiam o que fica entre e além delas. Como vêm, não se sobrepõem, então as proporções somam 100%. Vogais de Hillenbrand et al. (1995) para o inglês americano, com médias sobre as medições publicadas do estudo, e de Escudero et al. (2009), Tabela I, para o português brasileiro. Todas as citações estão no `reference.json`, em `sources`, e as ressalvas de cada estudo estão no README.
