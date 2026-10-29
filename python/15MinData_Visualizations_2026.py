# -*- coding: utf-8 -*-
'''
---------------------------- TOOL PURPOSE ---------------------------------------
To create a variety of visualizations (graphs) using 15-minute demand data 
that help to understand trends in the plant's demand patterns. The following
visualizations will be produced:
1. Histogram of demand magnitude
2. Line graph of annual demand pattern
3. Line graph of average daily demand pattern for each day
4. Line graph of average daily demand pattern for week days (Mon-Fri)
5. Line graph of average daily demand pattern for weekends (Sat-Sun)
6. Line graph of average daily demand pattern for hottest days (July, August)
7. Line graph of average daily demand pattern for coolest days (December, January)
8. Box and whisker plot for monthly demand
---------------------------------------------------------------------------------

---------------------------- TOOL CONTENTS --------------------------------------
1. INPUTS - modify each input variable according to the instructions;
   for further directions on how to modify a variable, including example
   pictures and troubleshooting steps, look at the Word document guide
2. CALCULATIONS/PLOTTING - do not modify this or the tool will break :/
---------------------------------------------------------------------------------

---------------------------- INSTRUCTIONS ---------------------------------------
- FOR INSTRUCTIONS WITH PICTURES AND TROUBLESHOOTING STEPS, OPEN THE WORD DOCUMENT GUIDE -
 
FILE ORGANIZATION (in File Explorer/Manager)
1. Download this Python tool (15MinData_Visualizations_2026.py) and all 15-minute data file(s) for which you 
   want to create vizualizations (only one file path is necessary, but multiple can be pasted in 
   case you have multiple electrical meters that you want to perform a combined analysis on) 
   in the same folder. Ensure the data file is in Excel format (.xslx file extension).
   To get the 15-minute data files, ask the facility to request them from their utility provider.
   Sometimes, Python has restricted access to some folders (such as the OneDrive folder). 
   To fix this, save the files in the Downloads folder.
   
EXCEL FILE EDITING
2. Open the 15-minute data file(s) in Excel and delete all columns except the following:
    
    A             B                  C
   Date         Time       Energy Consumption (kWh)
   
   If there are multiple "Energy Consumption" columns in one Excel file, each of these columns
   likely belongs to a different meter. Split these into multiple files, each with duplicate "Date"
   and "Time" columns. Ensure the columns are in the order shown above. If you were given multiple 
   15-minute data files (in the case of multiple meters), and you intend to plot the data of all meters 
   together, ensure each file begins and ends with the same start and stop "Date" and "Time".  If 
   they don't, delete rows with extra "Date" and "Time" values not present in other files.
3. For each 15-minute data file that you download has the same start and stop dates.
4. Take note of the interval between time steps as you will use this value later. Then, select the
   "Date" column (including the heading), and make all values be in the "Short Date" format. Select
   "Time" and "Energy Consumption" columns and select the "Number" format. Your "Time" column should
   start at a value of 0 at the beginning of each day and increase (in ascending order) to 0.9895 
   by the end of the day. It should restart this cycle each day.
5. Save the updated 15-minute data file(s). Ensure they are in the same folder as the Python tool.

PYTHON FILE EDITING
6. Open the Python file in your favorite IDE (like Spyder, Jupyter notebook, etc.).
7. Open the file manager. For each 15-minute data file you want to create vizualizations for, 
   right click the file in the file manager and select "Copy as path". Then, in the Python 
   tool paste each within the list in the INPUTS section with the name "data_file_paths".
   Separate list items with a comma.
8. For each file path you pasted, change the backslashes to forward slashes.
9. Type the time interval between data points you noted in step 4 in the variable "time_step". 
   Most will have 15 minutes, and so this is the default value.
10. Type either "kW" or "kVA" in the variable "demand_type" depending on which demand unit you want
   your graphs in. 
   If you chose "kVA", type one power factor value (from 0 to 1) in the list "power_factors" for each 
   15-minute Excel file you want to process. Note that the first power factor value in "power_factors" 
   corresponds to the first Excel file path in "data_file_paths", and the same for the second, etc.
   If you chose "kW", type "NA" in "power_factor".
11. Type the title header you want for your graphs in "title_header". If you have only one
   15-minute demand data file, this should probably be blank ("") so no header is added to 
   the title. If you have uploaded all files for your site's meters, this should probably be 
   "All Meters". If you have only uploaded a single meter, name it for that meter "Meter ####".
12. Run your code!!
---------------------------------------------------------------------------------
'''




##################################################################################
############################### INPUTS ###########################################
##################################################################################

data_file_paths = ["C:/Users/nshan/Downloads/Gurecky Manufacturing Historical Interval Data - 9.9.2025.xlsx"]
time_step = 60 # in minutes
demand_type = "kVA" # type "kW" or "kVA" (second choice for Houston and Puerto Rico)
power_factors = "NA" # "NA" or list of numbers from 0-1
title_header = "" # Building or meter name that you want at the beginning of your graphs

##################################################################################
##################################################################################
##################################################################################





##################################################################################
####################### CALCULATIONS/PLOTTING ####################################
##################################################################################

##### IMPORTING MODULES #####
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.dates as mdates




##### INPUTS VALIDATION #####

for i, path in enumerate(data_file_paths):
    if ".csv" in path:
        raise Exception("Each 15-minute demand file must be saved in the Excel (.xlsx) format. Correct any files in .csv or other formats.")
    try:
        test = pd.read_excel(path)
    except:
        if i == 0:
            suffix = "st"
        elif i == 1:
            suffix = "nd"
        elif i == 2:
            suffix = "rd"
        else:
            suffix = "th"
        raise Exception(f"The {str(i+1)}{suffix} 15-minute Excel file path (index {str(i)}) in data_file_paths can't be accessed. Please check that this file path is correct and try to run the code again.")

if time_step <= 0 or ((type(time_step) != int) and (type(time_step) != float)):
    raise Exception("A time_step value of {str(time_step)} is not valid. Ensure that you type a positive number in this variable.")
    
if (demand_type != "kW") and (demand_type != "kVA"):
    raise Exception('Invalid value for demand_type. It must be either "kW" or "kVA".')
    
if (demand_type == "kVA") and (power_factors == "NA"):
    raise Exception('Remember that if your demand is in kVA, you must input a list of power factors (from 0-1) where each value in the list corresponds to a different 15-minute Excel file path.')

if (type(power_factors) != list) and (power_factors != "NA"):
    raise Exception('Invalid value for power_factors. It must either be a list of numbers from 0-1 (if demand_type is in kVA) or "NA" (if demand_type is in kW).')
if type(power_factors) == list:
    for PF in power_factors:
        if PF >= 0 and PF <= 1:
            pass
        else:
            raise Exception("Ensure all of your power factor values in power_factors are between 0 and 1.")
            
if type(title_header) != str:
    raise Exception('Invalid value for title_header. It must be a string meaning text inside of quotes; Ex: "All Meters"')




##### FILE READING AND FORMATTING VALIDATION #####
def import_sort_data(data_file_paths):
  for i, path in enumerate(data_file_paths):
    data = pd.read_excel(path)
    
    # Check for proper date format
    read_date = data.iloc[:, 0]
    try:
        pd.to_datetime(read_date)
    except:
        raise Exception('Your "Date" colummn is not in the correct format. Ensure that it is in the "Short Date" format in Excel.')
    
    # Check for proper time and energy format
    if (data.iloc[:, 1].dtype != 'float64') and (data.iloc[:, 1].dtype != 'int32'):
        raise Exception('Your "Time" column is not in the correct format. Make sure to set it to the "Number" format in Excel.')
    if (data.iloc[:, 2].dtype != 'float64') and (data.iloc[:, 2].dtype != 'int32'):
        raise Exception('Your "Energy Consumption" column is not in the correct format. Make sure to set it to the "Number" format in Excel.')
       
    # Checks for proper time ranges
    if (data.iloc[:, 1] < 0).any() or (data.iloc[:, 1] > 1).any():
        raise Exception('Your "Time" column has values outside of the 0-1 range. Make sure that it starts at 0 and increases to 0.9896 each day (restarting each day).')
    
    if data_file_paths.index(path) == 0:
      # Timestamp
      read_date = data.iloc[:, 0]
      read_date = pd.to_datetime(read_date)
      read_date = read_date.rename("Date")
      read_time = data.iloc[:, 1]*1440
      read_time.round(decimals = 0)
      read_time = read_time.rename("Time (min)")
      timestamp = read_date + read_time.apply(lambda x: pd.Timedelta(minutes=x))
      timestamp = timestamp.rename("Timestamp")

      # Energy (kWh) and various Powers (kW, KVA, KVAR)
      energy_usage = data.iloc[:, 2].rename("Usage (kWh)")
      if demand_type == "kW":
          power = (60/time_step)*energy_usage.rename("Power (kW)")         
      else:
          power = (1/power_factors[i])*(60/time_step)*energy_usage.rename("Power (kVA)")
    else:
      energy_usage += data.iloc[:, 2]
      if demand_type == "kW":    
          power += (60/time_step)*data.iloc[:, 2]                       
      else:
          power += (1/power_factors[i])*(60/time_step)*data.iloc[:, 2]  
  utility_data = pd.concat([read_date, read_time, timestamp, energy_usage, power], axis = 1)
  utility_data["Time (min)"] = utility_data["Time (min)"].round(0)
  return utility_data

utility_data = import_sort_data(data_file_paths)



##### HISTOGRAM OF DEMAND MAGNITUDE #####

# Selecting power data
if demand_type == 'kW':
    power = utility_data["Power (kW)"]
else:
    power = utility_data["Power (kVA)"]

# Histogram to inspect power consumption distribution
bins_num = 30
plt.hist(power, bins = bins_num)
plt.title(title_header + " Demand Histogram with " + str(bins_num) + " bins")
plt.ylabel("Count")
plt.xlabel("Demand ("+demand_type+")")




##### ANNUAL DEMAND ANALYSIS #####

# Collecting and processing data for values of interest
utility_data = import_sort_data(data_file_paths)

timestamp = utility_data["Timestamp"]
if demand_type == 'kW':
    power = utility_data["Power (kW)"]
else:
    power = utility_data["Power (kVA)"]

peak_power = max(power)

nonzero_power = power[power != 0]
min_power = min(nonzero_power)

avg_power = power.mean()

zero_power = power[power == 0]
zero_power_indices = power.index[power == 0]
times_zero_power = timestamp.loc[zero_power_indices]

# Plotting data
t = np.array([min(timestamp), max(timestamp)])

fig, ax = plt.subplots()

plt.plot(timestamp, power)
plt.plot(t, np.array([peak_power, peak_power]), linestyle = ':', c = 'r', linewidth = 3, label = "Peak Demand")
plt.plot(t, np.array([avg_power, avg_power]), linestyle = ':', c = "y", linewidth = 3, label = "Average Demand")
plt.plot(t, np.array([min_power, min_power]), linestyle = ':', c = 'b', linewidth = 3, label = "Lowest Nonzero Demand")
plt.scatter(times_zero_power, zero_power, c = 'g', s = 100, label = "Zero Demand")

ax.xaxis.set_major_locator(mdates.MonthLocator(interval=2))

plt.text(max(timestamp) + pd.Timedelta(days = 25), peak_power, str(round(peak_power, 1)) + demand_type)
plt.text(max(timestamp) + pd.Timedelta(days = 25), min_power, str(round(min_power, 1)) + demand_type)
plt.text(max(timestamp) + pd.Timedelta(days = 25), avg_power, str(round(avg_power, 1)) + demand_type)

plt.title(title_header + " Annual Demand Pattern")
plt.xlabel("Time and Date")
plt.ylabel("Demand ("+demand_type+")")
plt.legend(framealpha = 1, loc='lower center', bbox_to_anchor=(0.5, -0.4))
plt.show()




##### DAILY DEMAND ANALYSIS #####

def daily_demand_anaylsis(days_to_plot, average_days, months_to_plot, average_months, title_tail):
    # Create day of the week and month columns
    utility_data['day_of_week'] = utility_data['Timestamp'].dt.dayofweek
    utility_data['month'] = utility_data['Timestamp'].dt.month
    utility_data_months = utility_data[utility_data['month'].isin(months_to_plot)]
    utility_data_months = utility_data_months.dropna(subset = ['Usage (kWh)'])
    
    # Finding average daily values and creating a line for each day
    avg_max_min_series = []
    single_day_series = []
    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    
    if average_days == True:
      daily_data = utility_data_months[utility_data_months['day_of_week'].isin(days_to_plot)].reset_index()
      # Splitting up into individual day series
      day_end_indices = daily_data[daily_data['Time (min)'] == 1440-time_step].index ############################################################ 1425.0
      for i in day_end_indices:
        one_day_data = []
        one_day_means = []
        for i in range(len(day_end_indices)):
          if i == 0:
            one_day_data.append(daily_data.iloc[:day_end_indices[i]+1])
          else:
            one_day_data.append(daily_data.iloc[day_end_indices[i-1]+1:day_end_indices[i]+1])
      single_day_series.append(one_day_data)
      # Average demand at each time on a specific day (Ex: average kW at 2:30PM on Tuesday)
      daily_data_nonzero = daily_data[daily_data['Power ('+demand_type+')'] != 0]
      daily_data_grouped = daily_data_nonzero.groupby('Time (min)')['Power ('+demand_type+')']
      avg_daily_data = daily_data_grouped.mean().reset_index()
      max_daily_data = daily_data_grouped.max().reset_index()
      min_daily_data = daily_data_grouped.min().reset_index()
      avg_max_min_series.append([avg_daily_data, max_daily_data, min_daily_data])
    else:
      for day in days_to_plot:
        # Iterating Monday through Sunday
        daily_data = utility_data_months[utility_data_months['day_of_week'] == day].reset_index()
        # Splitting up into individual day series
        day_end_indices = daily_data[daily_data['Time (min)'] == 1440-time_step].index ############################################################ 1425.0
        for i in day_end_indices:
          one_day_data = []
          one_day_means = []
          for i in range(len(day_end_indices)):
            if i == 0:
              one_day_data.append(daily_data.iloc[:day_end_indices[i]+1])
            else:
              one_day_data.append(daily_data.iloc[day_end_indices[i-1]+1:day_end_indices[i]+1])
        single_day_series.append(one_day_data)
    
        # Average demand at each time on a specific day (Ex: average kW at 2:30PM on Tuesday)
        daily_data_nonzero = daily_data[daily_data['Power ('+demand_type+')'] != 0]
        daily_data_grouped = daily_data_nonzero.groupby('Time (min)')['Power ('+demand_type+')']
        avg_daily_data = daily_data_grouped.mean().reset_index()
        max_daily_data = daily_data_grouped.max().reset_index()
        min_daily_data = daily_data_grouped.min().reset_index()
        avg_max_min_series.append([avg_daily_data, max_daily_data, min_daily_data])
    
    
    # Producing graphs of various types
    if average_days == True:
      daily_data = utility_data_months[utility_data_months['day_of_week'].isin(days_to_plot)]
      avg_daily_data = avg_max_min_series[0][0]
      max_daily_data = avg_max_min_series[0][1]
      min_daily_data = avg_max_min_series[0][2]
      # day_name = day_names[day]
    
      plt.figure()
    
      one_day_data = single_day_series[0]
      for i in one_day_data:
        if i is one_day_data[10]:
          #plt.plot(i["Time (min)"]/60, i["Power (kW)"], c = '0.4', alpha = 0.3, label = "Individual Days")
          plt.plot(i["Time (min)"]/60, i['Power ('+demand_type+')'], c = '0.4', alpha = 0.3, label = "Individual Days")
        else:
          plt.plot(i["Time (min)"]/60, i['Power ('+demand_type+')'], c = '0.4', alpha = 0.3)
          continue
    
      plt.plot(avg_daily_data["Time (min)"]/60, avg_daily_data['Power ('+demand_type+')'], c = 'k', linewidth = 6, label = "Average Demand")
      plt.plot(max_daily_data["Time (min)"]/60, max_daily_data['Power ('+demand_type+')'], linestyle = ':', c = 'r', linewidth = 3, label = "Peak Demand")
      plt.plot(min_daily_data["Time (min)"]/60, min_daily_data['Power ('+demand_type+')'], linestyle = ':', c = 'b', linewidth = 3, label = "Lowest Nonzero Demand")
    
      plt.title(title_header + " Average Daily Demand Pattern " + title_tail)
      plt.xlabel('Time of Day (hours)')
      plt.ylabel('Demand ('+demand_type+')')
      plt.legend(framealpha = 1, loc='lower center', bbox_to_anchor=(0.5, -0.4))
      plt.grid(True)
      plt.show()
    else:
      for day in days_to_plot:
        daily_data = utility_data_months[utility_data_months['day_of_week'] == day]
        avg_daily_data = avg_max_min_series[day][0]
        max_daily_data = avg_max_min_series[day][1]
        min_daily_data = avg_max_min_series[day][2]
        day_name = day_names[day]
    
        plt.figure(day)
    
        one_day_data = single_day_series[day]
        for i in one_day_data:
          if i is one_day_data[0]:
            plt.plot(i["Time (min)"]/60, i["Power ("+demand_type+")"], c = '0.4', alpha = 0.3, label = "Individual Days")
          else:
            plt.plot(i["Time (min)"]/60, i["Power ("+demand_type+")"], c = '0.4', alpha = 0.3)
    
        plt.plot(avg_daily_data["Time (min)"]/60, avg_daily_data["Power ("+demand_type+")"], c = 'k', linewidth = 6, label = "Average Demand")
        plt.plot(max_daily_data["Time (min)"]/60, max_daily_data["Power ("+demand_type+")"], linestyle = ':', c = 'r', linewidth = 3, label = "Peak Demand")
        plt.plot(min_daily_data["Time (min)"]/60, min_daily_data["Power ("+demand_type+")"], linestyle = ':', c = 'b', linewidth = 3, label = "Lowest Nonzero Demand")
    
        plt.title(title_header + " Average Daily Demand Pattern on " + day_name)
        plt.xlabel('Time of Day (hours)')
        plt.ylabel('Average Demand (kW)')
        plt.legend(framealpha = 1, loc='lower center', bbox_to_anchor=(0.5, -0.4))
        plt.grid(True)
        plt.show()


######## Instructions for using daily_demand_anaylsis ##########

# Type numbers in the days_to_plot list corresponding to the days you want to plot (0=Monday, 1=Tuesday...)
# Type True for average_days if you want to average behavior across all listed days; type false if you want to plot the days individually
# Type numbers in the months_to_plot list corresponding to the months you want to plot (1=January, 2=February...)
# Type True for average_months if you want to average behavior across all days in the listed months; type false if you want to make a separate plot for days in each month
# Type descriptive graph information in title_tail
################################################################

# Various daily demand patterns
# average demand pattern for each day of the week
days_to_plot = range(0, 7) # must be a list
average_days = False
months_to_plot = range(1, 13) # must be a list
average_months = True
title_tail = ""
daily_demand_anaylsis(days_to_plot, average_days, months_to_plot, average_months, title_tail)
# average week day demand pattern
days_to_plot = range(0, 5) # must be a list
average_days = True
months_to_plot = range(1, 13) # must be a list
average_months = True
title_tail = "for Mon-Fri throughout the Year"
daily_demand_anaylsis(days_to_plot, average_days, months_to_plot, average_months, title_tail)
# averge weekend demand pattern
days_to_plot = [5, 6] # must be a list
average_days = True
months_to_plot = range(1, 13) # must be a list
average_months = True
title_tail = "for Sat-Sun throughout the Year"
daily_demand_anaylsis(days_to_plot, average_days, months_to_plot, average_months, title_tail)
# average July-August demand pattern
days_to_plot = range(0, 7) # must be a list
average_days = True
months_to_plot = [7, 8] # must be a list
average_months = True
title_tail = "for days in July and August"
daily_demand_anaylsis(days_to_plot, average_days, months_to_plot, average_months, title_tail)
# average December-January demand pattern
days_to_plot = range(0, 7) # must be a list
average_days = True
months_to_plot = [12, 1] # must be a list
average_months = True
title_tail = "for days in December and January"
daily_demand_anaylsis(days_to_plot, average_days, months_to_plot, average_months, title_tail)
# week days/weekends in Jul/Aug and Dec/Jan?????




##### MONTHLY DEMAND ANALYSIS #####

# Create a month column
utility_data['month'] = utility_data['Timestamp'].dt.month
# Calculating max, min, and quartiles for each month
single_month_series = []
for i in utility_data["month"].unique():
  monthly_data = utility_data[utility_data['month'] == i]["Power ("+demand_type+")"]
  single_month_series.append(monthly_data.to_numpy())

plt.boxplot(single_month_series)
plt.xlabel("Month")
plt.ylabel("Demand ("+demand_type+")")
plt.title(title_header + " Box and Whisker Plots for Demand vs Month")

plt.show()

##################################################################################
##################################################################################
##################################################################################
