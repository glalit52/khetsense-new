import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const farmSchema = new mongoose.Schema({
  name: { type: String, default: "" },
  lat: Number,
  lon: Number,
  place: String,
  state: String,
  crop: { type: String, default: "wheat" },
  sowDate: String,
  area: Number,
  soilType: { type: String, enum: ["loamy", "sandy", "clay", "silt", "black", "red", "alluvial", ""], default: "" },
  irrigationType: { type: String, enum: ["rainfed", "canal", "drip", "sprinkler", "borewell", ""], default: "" },
  farmingType: { type: String, enum: ["organic", "conventional", "integrated", ""], default: "" },
  notes: { type: String, default: "" },
  boundary: { type: [[Number]], default: [] }, // Array of [lat, lon] points for drawn field polygon
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, default: "" },
  password: { type: String, required: true, minlength: 6 },
  lang: { type: String, default: "hi" },
  farm: { type: farmSchema, default: () => ({}) },
  subId: { type: String, default: null },
  alertChannels: {
    phone: { type: String, default: null },
    whatsapp: { type: Boolean, default: false },
    telegramChatId: { type: String, default: null },
  },
  analysisHistory: [
    {
      type: { type: String }, // 'snapshot', 'scan', 'brief'
      crop: String,
      place: String,
      summary: String,
      riskLevel: String,
      riskScore: Number,
      createdAt: { type: Date, default: Date.now },
    }
  ],
}, { timestamps: true });

// Hash password before save
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

export default mongoose.model("User", userSchema);
