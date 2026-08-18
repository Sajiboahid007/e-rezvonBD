import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();

app.use(
  cors({
    origin: "*",
  })
);
app.use(express.json());

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
