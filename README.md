# LoopMaster AI

Aplicativo desktop para MAC ARM para detecção automática de loop points em arquivos de áudio, com sugestão inteligente de loop points usando IA.

## Funcionalidades

- **Detecção automática de loop points**: Analisa a waveform e encontra os melhores pontos de loop baseados em zero-crossing e correlação
- **Sugestão de nomes com IA**: Usa a API Groq (gratuita) para sugerir nomes profissionais para seus samples
- **Exportação WAV com smpl chunk**: Os arquivos exportados incluem metadata de loop compatível com samplers
- **Visualização de waveform**: Interface visual para ajustar e verificar os pontos de loop
- **Compatível com Kontakt**: Os WAV exportados funcionam diretamente com Native Instruments Kontakt

## Requisitos

### Para Usuários (App Compilado)
- macOS 10.13 ou superior
- Nenhuma dependência adicional necessária

### Para Desenvolvedores
- Node.js 18 ou superior
- npm

## Instalação (Usuário Final)

1. Baixe o arquivo `.dmg` da [página de releases](../../releases)
2. Abra o DMG e arraste o **LoopMaster AI** para a pasta Aplicativos
3. Execute o aplicativo
4. Na primeira execução, configure sua chave API do Groq (opcional, mas recomendado para sugestões de nomes)

## Instalação (Desenvolvimento)

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/loopmaster-ai.git
cd loopmaster-ai

# Instale as dependências
npm install

# Execute em modo desenvolvimento
npm run electron:dev

# Para compilar o app
npm run electron:build
```

## Configuração da API Key

O LoopMaster AI usa a API Groq para sugerir nomes inteligentes para seus loops. A API Groq é **gratuita**.

### Como obter sua chave:

1. Acesse [console.groq.com/keys](https://console.groq.com/keys)
2. Crie uma conta gratuita
3. Gere uma nova API key
4. No LoopMaster AI, clique no botão **Settings** (canto superior direito)
5. Cole sua API key e clique em **Salvar**

> **Nota**: A chave é armazenada localmente no seu navegador/app. Não é enviada para nenhum servidor além da API Groq.

## Como Usar

1. **Carregue um arquivo de áudio**: Arraste e solte um arquivo WAV na área indicada ou clique para selecionar
2. **Aguarde a análise**: O app detectará automaticamente os melhores pontos de loop
3. **Selecione um loop point**: Escolha entre as sugestões encontradas (ordenadas por qualidade)
4. **Preview**: Use o player para ouvir como ficará o loop
5. **Ajuste manualmente** (opcional): Use os controles para refinar os pontos de início e fim
6. **Exporte**: Clique em "Export WAV" para salvar o arquivo com os loop points embutidos

## Uso com Native Instruments Kontakt

### Opção 1: Importação Direta
Os arquivos WAV exportados pelo LoopMaster AI incluem o chunk `smpl` com os loop points. O Kontakt reconhece automaticamente esses pontos ao carregar o sample.

### Opção 2: Script Lua (Creator Tools)
Para importar múltiplos samples de uma vez, use os scripts Lua incluídos:

1. Abra o **Kontakt Creator Tools**
2. Vá em **Lua Scripting**
3. Carregue o script `Import Samples With Loop Points.lua`
4. Selecione os arquivos WAV exportados

## Estrutura do Projeto

```
loopmaster-ai/
├── App.tsx              # Componente principal React
├── components/          # Componentes da UI
├── services/
│   ├── audioDsp.ts      # Algoritmo de detecção de loops
│   ├── groqService.ts   # Integração com API Groq
│   └── wavWriter.ts     # Exportação WAV com smpl chunk
├── electron/
│   └── main.cjs         # Main process do Electron
├── types.ts             # Tipos TypeScript
└── vite.config.ts       # Configuração Vite
```

## Scripts Disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Inicia o servidor Vite (modo web) |
| `npm run electron:dev` | Inicia em modo desenvolvimento Electron |
| `npm run build` | Compila para produção (web) |
| `npm run electron:build` | Compila o app Electron (.app/.dmg) |

## Tecnologias Utilizadas

- **React 18** - Interface do usuário
- **TypeScript** - Tipagem estática
- **Vite** - Build tool
- **Electron** - Desktop app
- **Web Audio API** - Processamento de áudio
- **Groq API** - IA para sugestão de nomes (Llama 3.1)

## Licença

MIT License

## Autor

WALTER AUGUSTO OSORIO JUNIOR
