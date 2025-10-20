import React from 'react';

interface MachineTypeFilterProps {
  selectedType: 'all' | 'washer' | 'dryer';
  onTypeChange: (type: 'all' | 'washer' | 'dryer') => void;
}

export const MachineTypeFilter: React.FC<MachineTypeFilterProps> = ({
  selectedType,
  onTypeChange,
}) => {
  return (
    <div className="mb-4 flex justify-center">
      <select
        value={selectedType}
        onChange={(e) => {
          console.log('Filter changed to:', e.target.value);
          onTypeChange(e.target.value as 'all' | 'washer' | 'dryer');
        }}
        className="px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="all">All Machines</option>
        <option value="washer">Washers Only</option>
        <option value="dryer">Dryers Only</option>
      </select>
    </div>
  );
};