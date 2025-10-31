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

// POST /api/login - Login de usuário
app.post("/api/login", (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email e senha são obrigatórios" });
    }

    const usersContent = readFile("users.txt");
    const users = usersContent
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
    if (!user) {
      return res.status(401).json({ error: "Usuário não encontrado" });
    }

    if (!verifyPassword(password, user.password)) {
      return res.status(401).json({ error: "Senha incorreta" });
    }

    // Retornar dados do usuário sem senha
    const { password: _, ...userWithoutPassword } = user;
    res.json({
      user: userWithoutPassword,
      token: "admin-token", // Token simples para demo
    });
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

// POST /api/users - Cadastro de usuário
app.post("/api/users", (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ error: "Nome, email e senha são obrigatórios" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "A senha deve ter pelo menos 6 caracteres" });
    }

    // Verificar se usuário já existe
    const usersContent = readFile("users.txt");
    const users = usersContent
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

    if (users.some((u) => u.email === email)) {
      return res.status(400).json({ error: "Email já cadastrado" });
    }

    // Criar novo usuário
    const newUser = {
      id: Date.now().toString(),
      name,
      email,
      password: hashPassword(password),
      role: email === "admin@teste.com" ? "admin" : "user",
      createdAt: new Date().toISOString(),
    };

    const userLine = JSON.stringify(newUser) + "\n";
    appendFile("users.txt", userLine);

    // Retornar dados do usuário sem senha
    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json(userWithoutPassword);
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ error: "Erro ao criar usuário" });
  }
});

// GET /api/admin/all-data - Dados de todos os usuários (apenas admin)
app.get("/api/admin/all-data", (req, res) => {
  try {
    // Verificar se é admin (simplificado - em produção usar JWT)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Não autorizado" });
    }

    const token = authHeader.substring(7);
    // Em produção, verificar JWT token aqui
    // Por enquanto, aceitar qualquer token

    // Ler todos os usuários
    const usersContent = readFile("users.txt");
    const users = usersContent
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

    // Ler todos os aparelhos do arquivo único
    const appliancesContent = readFile("appliances.txt");
    const allAppliances = appliancesContent
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

    // Para cada usuário, filtrar seus aparelhos
    const allData = users.map((user) => {
      const userAppliances = allAppliances.filter(
        (app) => app.userId === user.id
      );

      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
        },
        appliances: userAppliances,
      };
    });

    res.json(allData);
  } catch (error) {
    console.error("Error getting all data:", error);
    res.status(500).json({ error: "Erro ao obter dados" });
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
          const appliance = JSON.parse(line);
          return appliance.userId === userId ? appliance : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean);

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
    const appliance = { ...req.body, userId };

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
