export const GRPConfig = {
  JwtSecret: process.env.JWT_SECRET || "rezvon_e_commerce_jwt_secret_key_2026_bangladesh",
  JwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  RefreshTokenSecret: process.env.REFRESH_TOKEN_SECRET || "rezvon_refresh_token_secret_key_2026",
  RefreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "30d",
  ResetPasswordSecret: process.env.RESET_PASSWORD_SECRET || "rezvon_reset_password_secret_key",
  ResetPasswordExpiresIn: "1h",
  DefaultCustomerRoleId: 2,
  DefaultAdminRoleId: 1,
};

module.exports = {
  GRPConfig,
};
