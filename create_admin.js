// Script para criar usuário admin
// Execute com: node create_admin.js

// Simulação das funções necessárias
const hashPassword = (password) => {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString();
};

const verifyPassword = (password, hash) => {
  return hashPassword(password) === hash;
};

// Simulação do FileStorage
class FileStorage {
  readFile(filePath) {
    const content = localStorage.getItem(`wattstatus_file_${filePath}`);
    return content || "";
  }

  writeFile(filePath, content) {
    localStorage.setItem(`wattstatus_file_${filePath}`, content);
  }

  appendFile(filePath, content) {
    const existing = this.readFile(filePath);
    this.writeFile(filePath, existing + content);
  }

  saveUser(user) {
    const userLine = JSON.stringify(user) + "\n";
    this.appendFile("data/users.txt", userLine);
  }
}

const fileStorage = new FileStorage();

// Criar usuário admin
const adminUser = {
  id: "admin-001",
  name: "Administrador",
  email: "admin",
  password: hashPassword("admin"),
  role: "admin",
  createdAt: new Date().toISOString(),
};

fileStorage.saveUser(adminUser);
console.log("✅ Usuário admin criado com sucesso!");
console.log("📧 Email: admin");
console.log("🔒 Senha: admin");
console.log("👤 Função: admin");
console.log("");
console.log(
  "💡 Agora você pode fazer login com essas credenciais no painel admin."
);
