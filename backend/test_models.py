from data_loader import load_data
from regime_detector import fit_regime, current_regime
from forecaster import train_forecaster, get_latest_forecast, conformal_coverage

df = load_data()
print("Fitting regime...")
fit_regime(df)
reg = current_regime(df)
print("Regime:", reg)

print("Training forecaster...")
train_forecaster(df)
fc = get_latest_forecast(df, reg["quantile_adjustment"])
print("Forecast:", fc)

cov = conformal_coverage(df)
print("Coverage:", cov)
