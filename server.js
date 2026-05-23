const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();

app.use(cors());
app.use(express.json());

const VALID_KEYS = [
  "LARP-AAAA1111-BBBB-2222",
  "LARP-REALKEY-CCCC-3333",
  "LARP-PREMIUM-DDDD-4444"
];

app.post("/validate", (req, res) => {

  const { key, hwid } = req.body;

  console.log("Key Attempt:", key);
  console.log("HWID:", hwid);

  if (!VALID_KEYS.includes(key)) {
    return res.json({
      valid: false,
      error: "Invalid key"
    });
  }

  return res.json({
    valid: true,
    discord: "Licensed User",
    expires: null,
    sessionToken: crypto.randomUUID(),
    sessionExp: Date.now() + (15 * 60 * 1000)
  });

});

app.listen(3000, () => {
  console.log("Key server running on port 3000");
});