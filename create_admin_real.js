const fs = require("fs");
const path = require("path");

// Função para hash simples de senha
const hashPassword = (password) => {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString();
};

// Criar diretório data se não existir
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Criar usuário admin
const adminUser = {
  id: "admin-001",
  name: "Administrador",
  email: "admin@admin.com",
  password: hashPassword("adminadmin"),
  role: "admin",
  createdAt: new Date().toISOString(),
};

// Caminho do arquivo users.txt
const usersFile = path.join(dataDir, "users.txt");

// Salvar usuário admin no arquivo
const userLine = JSON.stringify(adminUser) + "\n";
fs.appendFileSync(usersFile, userLine);

console.log("✅ Usuário admin criado com sucesso!");
console.log("📧 Email: admin@admin.com");
console.log("🔒 Senha: admin");
console.log("👤 Função: admin");
console.log("");
console.log("📁 Arquivo criado: data/users.txt");
console.log(
  "💡 Agora você pode fazer login com essas credenciais no painel admin."
);
console.log("");
console.log("Para visualizar o conteúdo do arquivo:");
console.log("cat data/users.txt");
