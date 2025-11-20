import os
import pandas as pd

# Getting the paths for the databases
imf_14_path = os.path.normpath(
	os.path.join(os.path.dirname(__file__), "..", "Datasets", "IMF", "14_Climate-related_Disasters_Frequency.csv")
)
imf_15_path = os.path.normpath(
	os.path.join(os.path.dirname(__file__), "..", "Datasets", "IMF", "15_Climate-driven_INFORM_Risk.csv")
)
health_data = os.path.normpath(
	os.path.join(os.path.dirname(__file__), "..", "Datasets", "CCHAIN", "health_facilities_cchain.csv")
)

# Print
# num_of_storms = pd.read_csv(imf_14_path)
# print(num_of_storms)

tite = pd.read_csv(health_data)
print(tite)



