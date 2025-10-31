const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Diretório de dados
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

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

// Função para verificar senha
const verifyPassword = (password, hash) => {
  return hashPassword(password) === hash;
};

// Ler arquivo
function readFile(filePath) {
  const fullPath = path.join(dataDir, filePath);
  if (!fs.existsSync(fullPath)) return "";
  return fs.readFileSync(fullPath, "utf8");
}

// Escrever arquivo
function writeFile(filePath, content) {
  const fullPath = path.join(dataDir, filePath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(fullPath, content, "utf8");
}

// Adicionar ao arquivo
function appendFile(filePath, content) {
  const existing = readFile(filePath);
  writeFile(filePath, existing + content);
}

// Rotas da API

// GET /api/users - Listar todos os usuários
app.get("/api/users", (req, res) => {
  try {
    const content = readFile("users.txt");
    if (!content) return res.json([]);

    const users = content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    res.json(users);
  } catch (error) {
    console.error("Error reading users:", error);
    res.status(500).json({ error: "Erro ao ler usuários" });
  }
});

// POST /api/users - Criar usuário
app.post("/api/users", (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Verificar se email já existe
    const content = readFile("users.txt");
    const users = content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const existingUser = users.find((user) => user.email === email);
    if (existingUser) {
      return res.status(400).json({ error: "Email já cadastrado" });
    }

    // Criar novo usuário
    const newUser = {
      id: Date.now().toString(),
      name,
      email,
      password: hashPassword(password),
      role: "user",
      createdAt: new Date().toISOString(),
    };

    // Salvar no arquivo
    const userLine = JSON.stringify(newUser) + "\n";
    appendFile("users.txt", userLine);

    // Retornar usuário sem senha
    const { password: _, ...userWithoutPassword } = newUser;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ error: "Erro ao criar usuário" });
  }
});

// POST /api/login - Login
app.post("/api/login", (req, res) => {
  try {
    const { email, password } = req.body;

    const content = readFile("users.txt");
    const users = content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const user = users.find((u) => u.email === email);
    if (!user || !verifyPassword(password, user.password)) {
      return res.status(401).json({ error: "Credenciais inválidas" });
    }

    // Retornar usuário sem senha
    const { password: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ error: "Erro ao fazer login" });
  }
});

// GET /api/appliances/:userId - Listar aparelhos do usuário
app.get("/api/appliances/:userId", (req, res) => {
  try {
    const { userId } = req.params;
    const content = readFile("appliances.txt");
    if (!content) return res.json([]);

    const appliances = content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .filter((appliance) => appliance.userId === userId);

    res.json(appliances);
  } catch (error) {
    console.error("Error reading appliances:", error);
    res.status(500).json({ error: "Erro ao ler aparelhos" });
  }
});

// POST /api/appliances/:userId - Adicionar aparelho
app.post("/api/appliances/:userId", (req, res) => {
  try {
    const { userId } = req.params;
    const appliance = { id: req.body.id || Date.now(), ...req.body, userId };

    const applianceLine = JSON.stringify(appliance) + "\n";
    appendFile("appliances.txt", applianceLine);

    res.json(appliance);
  } catch (error) {
    console.error("Error saving appliance:", error);
    res.status(500).json({ error: "Erro ao salvar aparelho" });
  }
});

// PUT /api/appliances/:userId/:applianceId - Atualizar aparelho
app.put("/api/appliances/:userId/:applianceId", (req, res) => {
  try {
    const { userId, applianceId } = req.params;
    const updatedAppliance = { ...req.body, userId };

    const content = readFile("appliances.txt");
    const appliances = content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const updatedAppliances = appliances.map((app) =>
      app.id === parseInt(applianceId) && app.userId === userId
        ? updatedAppliance
        : app
    );

    const newContent =
      updatedAppliances.map((app) => JSON.stringify(app)).join("\n") + "\n";
    writeFile("appliances.txt", newContent);

    res.json(updatedAppliance);
  } catch (error) {
    console.error("Error updating appliance:", error);
    res.status(500).json({ error: "Erro ao atualizar aparelho" });
  }
});

// DELETE /api/appliances/:userId/:applianceId - Deletar aparelho
app.delete("/api/appliances/:userId/:applianceId", (req, res) => {
  try {
    const { userId, applianceId } = req.params;

    const content = readFile("appliances.txt");
    const appliances = content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const filteredAppliances = appliances.filter(
      (app) => !(app.id === parseInt(applianceId) && app.userId === userId)
    );

    const newContent =
      filteredAppliances.map((app) => JSON.stringify(app)).join("\n") + "\n";
    writeFile("appliances.txt", newContent);

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting appliance:", error);
    res.status(500).json({ error: "Erro ao deletar aparelho" });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 API Server rodando em http://localhost:${PORT}`);
  console.log(`📁 Arquivos salvos em: ${dataDir}`);
});
