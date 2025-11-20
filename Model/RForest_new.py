from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error
import pandas as pd

# Step 1: Create a sample dataset
data = pd.DataFrame({
    'rainfall': [10, 80, 35, 60, 90, 45, 70],
    'river_level': [2.5, 4.2, 3.1, 3.8, 4.5, 3.0, 4.0],
    'soil_saturation': [40, 85, 60, 70, 90, 55, 80],
    'flood_risk_score': [1.2, 4.8, 2.5, 3.6, 5.0, 2.0, 4.2]
})

# Step 2: Define features and target
X = data[['rainfall', 'river_level', 'soil_saturation']]
y = data['flood_risk_score']

# Step 3: Split into training and testing sets
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=42)

# Step 4: Initialize and train the Random Forest Regressor
model = RandomForestRegressor(n_estimators=100, random_state=42)
model.fit(X_train, y_train)

# Step 5: Predict and evaluate
y_pred = model.predict(X_test)
mse = mean_squared_error(y_test, y_pred)

print("Predictions:", y_pred)
print("Mean Squared Error:", mse)