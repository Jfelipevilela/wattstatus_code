# WattStatus - Sistema de Monitoramento de Energia

Um sistema web completo para monitoramento e cálculo de consumo de energia elétrica de aparelhos domésticos, desenvolvido com React, TypeScript e Node.js.

## 📋 Descrição

O WattStatus permite aos usuários cadastrar seus aparelhos elétricos, calcular o consumo mensal de energia e acompanhar indicadores de eficiência energética. O sistema inclui funcionalidades de autenticação, gerenciamento de aparelhos e relatórios de consumo.

## 🚀 Funcionalidades

### Usuário Comum

- **Cadastro e Login**: Sistema de autenticação seguro
- **Gerenciamento de Aparelhos**: Adicionar, editar e remover aparelhos
- **Calculadora de Consumo**: Calcular custo mensal baseado em potência, horas de uso e tarifa
- **Dashboard**: Visualização de consumo e indicadores
- **Relatórios**: Análise detalhada do consumo energético
- **Dicas de Economia**: Sugestões para reduzir consumo

### Administrador

- **Painel Administrativo**: Acesso a dados de todos os usuários
- **Gerenciamento de Usuários**: Visualizar usuários cadastrados
- **Relatórios Globais**: Análise geral do sistema

## 🛠️ Tecnologias Utilizadas

### Frontend

- **React 18** - Biblioteca JavaScript para interfaces
- **TypeScript** - Tipagem estática
- **Vite** - Build tool e dev server
- **Tailwind CSS** - Framework CSS utilitário
- **shadcn/ui** - Componentes UI baseados em Radix UI
- **React Router** - Roteamento
- **React Hook Form** - Gerenciamento de formulários
- **Recharts** - Gráficos e visualizações
- **TanStack Query** - Gerenciamento de estado server

### Backend

- **Node.js** - Runtime JavaScript
- **Express.js** - Framework web
- **File System** - Persistência em arquivos TXT
- **CORS** - Compartilhamento de recursos

### Outros

- **ESLint** - Linting de código
- **PostCSS** - Processamento CSS
- **Autoprefixer** - Prefixos CSS automáticos

## 📁 Estrutura do Projeto

```
wattstatus_code/
├── data/                    # Arquivos de dados
│   ├── users.txt           # Dados dos usuários
│   └── appliances.txt      # Dados dos aparelhos
├── public/                 # Arquivos estáticos
├── src/
│   ├── components/         # Componentes React
│   │   ├── ui/            # Componentes base shadcn/ui
│   │   └── tabs/          # Abas das páginas
│   ├── hooks/             # Hooks customizados
│   ├── lib/               # Utilitários
│   ├── pages/             # Páginas da aplicação
│   └── utils/             # Funções utilitárias
├── server.cjs             # Servidor principal
├── server_admin.cjs       # Servidor administrativo
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── vite.config.ts
```

## 🔧 Instalação e Configuração

### Pré-requisitos

- Node.js (versão 18 ou superior)
- npm ou yarn

### Instalação

1. **Clone o repositório**

   ```bash
   git clone <URL_DO_REPOSITORIO>
   cd wattstatus_code
   ```

2. **Instale as dependências**

   ```bash
   npm install
   ```

3. **Inicie o servidor backend**

   ```bash
   # Servidor principal (porta 3001)
   node server.cjs

   # Ou servidor admin (porta 3001)
   node server_admin.cjs
   ```

4. **Inicie o frontend**

   ```bash
   npm run dev
   ```

5. **Acesse a aplicação**
   - Frontend: http://localhost:5173
   - API: http://localhost:3001

## 📊 API Endpoints

### Autenticação

- `POST /api/login` - Login de usuário
- `POST /api/users` - Cadastro de usuário

### Aparelhos

- `GET /api/appliances/:userId` - Listar aparelhos do usuário
- `POST /api/appliances/:userId` - Adicionar aparelho
- `PUT /api/appliances/:userId/:applianceId` - Atualizar aparelho
- `DELETE /api/appliances/:userId/:applianceId` - Remover aparelho

### Administrador

- `GET /api/admin/all-data` - Dados de todos os usuários (requer token)

## 💾 Persistência de Dados

O sistema utiliza arquivos TXT para persistência de dados:

- **users.txt**: Armazena usuários em formato JSON (uma linha por usuário)
- **appliances.txt**: Armazena aparelhos em formato JSON (uma linha por aparelho)

Cada aparelho inclui um `userId` como chave estrangeira para associar ao usuário.

## 🎨 Funcionalidades Principais

### Calculadora de Consumo

- Cálculo automático de consumo mensal
- Suporte a diferentes tarifas de energia
- Visualização de custos estimados

### Dashboard

- Gráficos de consumo por aparelho
- Indicadores de eficiência energética
- Alertas de consumo elevado

### Gerenciamento de Aparelhos

- CRUD completo de aparelhos
- Categorização por tipo
- Status de monitoramento

## 🚀 Scripts Disponíveis

```bash
npm run dev          # Inicia servidor de desenvolvimento
npm run build        # Build para produção
npm run build:dev    # Build para desenvolvimento
npm run preview      # Preview do build
npm run lint         # Executa linting
```

## 🔒 Segurança

- Hashing de senhas com algoritmo personalizado
- Validação de entrada de dados
- Controle de acesso baseado em roles (user/admin)
- CORS configurado para desenvolvimento

## 📱 Responsividade

A aplicação é totalmente responsiva e funciona em:

- Desktop
- Tablet
- Mobile

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📝 Licença

Este projeto está sob a licença MIT. Veja o arquivo `LICENSE` para mais detalhes.

## 👥 Autor

**João Felipe Vilela** - Desenvolvimento inicial

## 🙏 Agradecimentos

- [shadcn/ui](https://ui.shadcn.com/) - Componentes UI
- [Tailwind CSS](https://tailwindcss.com/) - Framework CSS
- [React](https://reactjs.org/) - Biblioteca JavaScript
- [Vite](https://vitejs.dev/) - Build tool
